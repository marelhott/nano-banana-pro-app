FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv git \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install PyTorch CUDA wheels first.
RUN python3 -m pip install --upgrade pip && \
    python3 -m pip install --index-url https://download.pytorch.org/whl/cu121 \
      torch==2.4.1 torchvision==0.19.1

COPY requirements.txt /app/requirements.txt
RUN python3 -m pip install -r /app/requirements.txt

COPY . /app

EXPOSE 7860

CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]

