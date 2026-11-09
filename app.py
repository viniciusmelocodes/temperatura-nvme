from collections import deque
from datetime import datetime
import glob
import re
import shutil
import subprocess

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

history = deque(maxlen=30)


def get_nvme_temperature(source):
    if source == 'sysfs':
        paths = glob.glob('/sys/class/nvme/nvme*/hwmon/hwmon*/temp1_input')
        paths += glob.glob('/sys/class/hwmon/hwmon*/temp1_input')

        for path in paths:
            try:
                with open(path.replace('temp1_input', 'name')) as name_file:
                    name = name_file.read().lower()
                if 'nvme' not in path.lower() and 'nvme' not in name:
                    continue
                with open(path) as temperature_file:
                    temp = int(temperature_file.read().strip()) / 1000
                    return round(temp, 1), None
            except (OSError, ValueError):
                continue

        return None, None

    smartctl = shutil.which('smartctl')
    if smartctl is None:
        return None, 'smartctl não foi encontrado no PATH.'

    try:
        output = subprocess.check_output(
            ['sudo', '-n', smartctl, '-a', '-d', 'nvme', '/dev/nvme0'],
            text=True,
            stderr=subprocess.PIPE,
            timeout=5
        )
    except subprocess.CalledProcessError as error:
        app.logger.warning('Falha ao consultar temperatura com smartctl: %s', error)
        return None, 'Acesso ao smartctl negado. Configure sudo sem senha para a consulta.'
    except subprocess.TimeoutExpired as error:
        app.logger.warning('Tempo limite ao consultar temperatura com smartctl: %s', error)
        return None, 'smartctl demorou demais para responder.'
    except OSError as error:
        app.logger.warning('Falha ao iniciar smartctl: %s', error)
        return None, 'Não foi possível iniciar smartctl.'

    match = re.search(r'(?:Composite Temperature|Temperature):\s*(\d+)', output)
    if match is None:
        return None, 'smartctl não retornou uma temperatura para este dispositivo.'
    return int(match.group(1)), None


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/temp')
def api_temp():
    source = request.args.get('source', 'sysfs')
    if source not in {'sysfs', 'smartctl'}:
        return jsonify({'error': 'Fonte inválida. Use sysfs ou smartctl.'}), 400

    temp, error = get_nvme_temperature(source)
    if temp is not None:
        history.append({
            'temp': temp,
            'time': datetime.now().astimezone().isoformat(timespec='seconds'),
            'source': source
        })
    return jsonify({
        'temp': temp,
        'source': source,
        'error': error,
        'history': list(history)
    })


if __name__ == '__main__':
    print("Monitor de temperatura NVMe rodando em: http://127.0.0.1:5010")
    app.run(host='0.0.0.0', port=5010, debug=False)
