import lamejs from 'lamejs';

// Convert an AudioBuffer to a WAV Blob
export function encodeWav(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  let result: Float32Array;
  if (numChannels === 2) {
    result = interleave(audioBuffer.getChannelData(0), audioBuffer.getChannelData(1));
  } else {
    result = audioBuffer.getChannelData(0);
  }
  
  const buffer = new ArrayBuffer(44 + result.length * 2);
  const view = new DataView(buffer);
  
  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, 36 + result.length * 2, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, format, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  // bits per sample
  view.setUint16(34, bitDepth, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, result.length * 2, true);

  // write the PCM samples
  let offset = 44;
  for (let i = 0; i < result.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, result[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(offset, s, true);
  }
  
  return new Blob([view], { type: 'audio/wav' });
}

// Convert an AudioBuffer to an MP3 Blob
export function encodeMp3(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, 128); // 128 kbps
  
  const left = audioBuffer.getChannelData(0);
  const right = numChannels > 1 ? audioBuffer.getChannelData(1) : left;
  
  const sampleBlockSize = 1152;
  const mp3Data: Uint8Array[] = [];
  
  for (let i = 0; i < left.length; i += sampleBlockSize) {
    const leftChunkFloat = left.subarray(i, i + sampleBlockSize);
    const rightChunkFloat = right.subarray(i, i + sampleBlockSize);
    
    const leftChunkInt16 = new Int16Array(leftChunkFloat.length);
    const rightChunkInt16 = new Int16Array(rightChunkFloat.length);
    
    for (let j = 0; j < leftChunkFloat.length; j++) {
      let sL = Math.max(-1, Math.min(1, leftChunkFloat[j]));
      leftChunkInt16[j] = sL < 0 ? sL * 0x8000 : sL * 0x7FFF;
      
      let sR = Math.max(-1, Math.min(1, rightChunkFloat[j]));
      rightChunkInt16[j] = sR < 0 ? sR * 0x8000 : sR * 0x7FFF;
    }
    
    let mp3buf;
    if (numChannels === 2) {
      mp3buf = encoder.encodeBuffer(leftChunkInt16, rightChunkInt16);
    } else {
      mp3buf = encoder.encodeBuffer(leftChunkInt16);
    }
    
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf.buffer, mp3buf.byteOffset, mp3buf.length));
    }
  }
  
  const mp3buf = encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(new Uint8Array(mp3buf.buffer, mp3buf.byteOffset, mp3buf.length));
  }
  
  return new Blob(mp3Data as unknown as BlobPart[], { type: 'audio/mp3' });
}

export async function convertBlobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const arrayBuffer = await blob.arrayBuffer();
  return await audioCtx.decodeAudioData(arrayBuffer);
}

function interleave(leftChannel: Float32Array, rightChannel: Float32Array): Float32Array {
  const length = leftChannel.length + rightChannel.length;
  const result = new Float32Array(length);
  
  let inputIndex = 0;
  for (let index = 0; index < length; ) {
    result[index++] = leftChannel[inputIndex];
    result[index++] = rightChannel[inputIndex];
    inputIndex++;
  }
  return result;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
