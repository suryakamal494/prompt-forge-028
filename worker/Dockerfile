FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cookies persist on a Railway volume mounted at /data
ENV COOKIE_PATH=/data/google_storage_state.json

CMD ["python", "-u", "worker.py"]
