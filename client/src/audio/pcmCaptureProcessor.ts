function floatTo16BitPCM(input: Float32Array): Uint8Array {
  const buf = new ArrayBuffer(input.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

function downsampleTo16kPcm(buffer: Float32Array, inputSampleRate: number): Uint8Array {
  const outputSampleRate = 16000;
  if (inputSampleRate === outputSampleRate) {
    return floatTo16BitPCM(buffer);
  }
  const ratio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), buffer.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += buffer[j];
    result[i] = sum / (end - start || 1);
  }
  return floatTo16BitPCM(result);
}

type PcmProcessorInit = { chunkSamples?: number };

class PcmCaptureProcessor extends AudioWorkletProcessor {
  private chunkIn: number;
  private buf: Float32Array;
  private len: number;
  private readonly inRate: number;

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    const po = options?.processorOptions as PcmProcessorInit | undefined;
    const chunk = po?.chunkSamples ?? 4096;
    this.chunkIn = chunk;
    this.buf = new Float32Array(chunk + 256);
    this.len = 0;
    this.inRate = sampleRate;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const ch0 = inputs[0]?.[0];
    const out0 = outputs[0]?.[0];
    if (ch0 && out0 && ch0.length === out0.length) {
      out0.set(ch0);
    }
    if (!ch0?.length) return true;

    for (let i = 0; i < ch0.length; i++) {
      if (this.len >= this.buf.length) {
        const bigger = new Float32Array(this.buf.length * 2);
        bigger.set(this.buf);
        this.buf = bigger;
      }
      this.buf[this.len++] = ch0[i];
    }

    while (this.len >= this.chunkIn) {
      const slice = this.buf.subarray(0, this.chunkIn);
      const pcm = downsampleTo16kPcm(slice, this.inRate);
      this.port.postMessage({ pcm }, [pcm.buffer]);

      const rest = this.len - this.chunkIn;
      this.buf.copyWithin(0, this.chunkIn, this.len);
      this.len = rest;
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);
