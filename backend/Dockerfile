FROM python:3.10-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY seed.py .
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh && mkdir -p /data

# La base SQLite vit dans le volume /data (voir docker-compose.yml)
ENV DATABASE_URL=sqlite:////data/shop.db
EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
