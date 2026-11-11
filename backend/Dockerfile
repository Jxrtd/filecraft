FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-calc libreoffice-impress tesseract-ocr tesseract-ocr-eng libglib2.0-0 libgl1 fonts-dejavu fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home --uid 10001 filecraft && mkdir -p /tmp/filecraft /home/filecraft/.u2net && chown -R filecraft:filecraft /tmp/filecraft /home/filecraft
COPY --chown=filecraft:filecraft app ./app
USER filecraft
ENV U2NET_HOME=/home/filecraft/.u2net OMP_NUM_THREADS=1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-proxy-headers", "--no-access-log", "--timeout-keep-alive", "5"]
