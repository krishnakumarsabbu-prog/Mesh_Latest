FROM python:3.10-slim
WORKDIR /workspace
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . /workspace/connector-gateway
WORKDIR /workspace/connector-gateway
EXPOSE 1010
CMD ["python", "main.py"]
