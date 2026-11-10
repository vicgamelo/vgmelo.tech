// Modelos servidos pelo próprio site (public/visao/models/). Não estão no npm, então ficam no git;
// o teste confere o SHA-256 de cada um contra esta lista, que é a fonte da verdade da origem e da licença.
export const MODELS = {
  yolox: {
    file: 'yolox_nano.onnx',
    sha256: 'c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d',
    source: 'https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.onnx',
    license: 'Apache-2.0',
  },
  hair: {
    file: 'hair_segmenter.tflite',
    sha256: '2628cf3ce5f695f604cbea2841e00befcaa3624bf80caf3664bef2656d59bf84',
    source: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/latest/hair_segmenter.tflite',
    license: 'Apache-2.0',
  },
  face: {
    file: 'face_landmarker.task',
    sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
    source: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
    license: 'Apache-2.0',
  },
} as const;

export const MODEL_DIR = '/visao/models';
export const modelUrl = (key: keyof typeof MODELS) => `${MODEL_DIR}/${MODELS[key].file}`;
