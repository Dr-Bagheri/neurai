# CUDA runtime base so the model can use the GPU alongside vLLM. Falls back to
# CPU automatically if no device is visible — slower, but functional, which
# matters for a laptop running the site without the `ai` profile's GPU.
FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

WORKDIR /app

RUN pip install --no-cache-dir \
      "fastapi==0.118.0" \
      "uvicorn[standard]==0.37.0" \
      "transformers==4.57.1" \
      "pydantic==2.12.0"

COPY app.py .

# HF_HOME is mounted from ./models so weights survive container rebuilds and
# are downloaded exactly once.
ENV HF_HOME=/models
ENV PYTHONUNBUFFERED=1

EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
