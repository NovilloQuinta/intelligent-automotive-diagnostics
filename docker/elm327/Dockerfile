FROM python:3.11-slim

RUN pip install --no-cache-dir --upgrade pip "setuptools<67" wheel && \
    pip install --no-cache-dir --no-build-isolation ELM327-emulator

WORKDIR /app

COPY docker/elm327/run_audi.py .
COPY docker/elm327/scenarios/ ./scenarios/

EXPOSE 35000

CMD ["sh", "-c", "tail -f /dev/null | exec python run_audi.py"]
