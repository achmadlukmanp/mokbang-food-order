FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV DB_PATH=/tmp/mokbang.db
EXPOSE 7860
CMD ["gunicorn", "-b", "0.0.0.0:7860", "app:app"]
