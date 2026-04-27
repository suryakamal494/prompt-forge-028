FROM mcr.microsoft.com/playwright/python:v1.47.0-jammy

WORKDIR /app

# System deps for python-pptx, weasyprint (PDF), etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b \
      libcairo2 libffi-dev shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m playwright install --with-deps chromium

COPY . .

# Cookies persist on a Railway volume mounted at /data
ENV COOKIE_PATH=/data/google_cookies.json

CMD ["python", "-u", "worker.py"]
