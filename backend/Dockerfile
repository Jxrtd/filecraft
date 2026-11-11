FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-calc libreoffice-impress
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home --uid 10001 filecraft && mkdir -p /tmp/filecraft
COPY --chown=filecraft:filecraft app ./app
USER filecraft
ENV U2NET_HOME=/home/filecraft/.u2net OMP_NUM_THREADS=1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-proxy-headers"]