FROM python:3.12-slim

WORKDIR /app

# Instalar deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Código y config
COPY simulator.py tags.yaml ./

# En Docker compose usaremos MQTT_HOST=mosquitto (servicio hermano del mismo compose).
# Sobreescribible en runtime con -e MQTT_HOST=...
ENV MQTT_HOST=mosquitto
ENV MQTT_PORT=1883
ENV PYTHONUNBUFFERED=1

CMD ["python", "simulator.py"]
