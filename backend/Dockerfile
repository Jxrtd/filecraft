FROM python:3.12-slim
ENV PIP_ROOT_USER_ACTION=ignore \
    U2NET_HOME=/home/filecraft/.u2net \
    OMP_NUM_THREADS=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home --uid 10001 filecraft \
    && mkdir -p /tmp/filecraft "$U2NET_HOME" \
    && python -c "from rembg.sessions.u2netp import U2netpSession; U2netpSession.download_models()" \
    && chown -R filecraft:filecraft /home/filecraft /tmp/filecraft
COPY --chown=filecraft:filecraft app ./app
USER filecraft
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-proxy-headers"]
