FROM python:3.11-slim

RUN pip install --no-cache-dir --upgrade pip "setuptools<67" wheel && \
    pip install --no-cache-dir --no-build-isolation ELM327-emulator

EXPOSE 35000

CMD ["sh", "-c", "tail -f /dev/null | exec python -m elm -s car -n 35000"]
