FROM python:3.10-slim
WORKDIR /workspace
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . /workspace/connectors/splunk-traffic-service
COPY ./shared /workspace/shared
WORKDIR /workspace/connectors/splunk-traffic-service
EXPOSE 1006
ENV PYTHONPATH=/workspace
CMD ["python", "main.py"]
