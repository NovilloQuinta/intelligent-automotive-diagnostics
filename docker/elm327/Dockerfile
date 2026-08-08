FROM python:3.11-slim

RUN pip install --no-cache-dir --upgrade pip "setuptools<67" wheel && \
    pip install --no-cache-dir --no-build-isolation ELM327-emulator

WORKDIR /app

COPY docker/elm327/run_audi.py .
COPY docker/elm327/run_kawasaki.py .
COPY docker/elm327/run_toyota.py .
COPY docker/elm327/scenarios/ ./scenarios/

EXPOSE 35000 35001

ENV SCENARIO_SCRIPT=run_audi.py

CMD sh -c "tail -f /dev/null | exec python ${SCENARIO_SCRIPT}"
