// As 80 classes do COCO, na ordem da saída do YOLOX. O índice 0 (pessoa) é o que a contagem usa.
export const COCO_EN = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
  'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
  'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
  'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
  'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
  'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone',
  'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear',
  'hair drier', 'toothbrush',
] as const;

export const COCO_PT = [
  'pessoa', 'bicicleta', 'carro', 'moto', 'avião', 'ônibus', 'trem', 'caminhão', 'barco', 'semáforo',
  'hidrante', 'placa de pare', 'parquímetro', 'banco', 'pássaro', 'gato', 'cachorro', 'cavalo', 'ovelha', 'vaca',
  'elefante', 'urso', 'zebra', 'girafa', 'mochila', 'guarda-chuva', 'bolsa', 'gravata', 'mala', 'frisbee',
  'esqui', 'snowboard', 'bola', 'pipa', 'taco de beisebol', 'luva de beisebol', 'skate', 'prancha de surfe',
  'raquete de tênis', 'garrafa', 'taça', 'xícara', 'garfo', 'faca', 'colher', 'tigela', 'banana', 'maçã',
  'sanduíche', 'laranja', 'brócolis', 'cenoura', 'cachorro-quente', 'pizza', 'donut', 'bolo', 'cadeira', 'sofá',
  'vaso de planta', 'cama', 'mesa', 'vaso sanitário', 'TV', 'notebook', 'mouse', 'controle remoto', 'teclado', 'celular',
  'micro-ondas', 'forno', 'torradeira', 'pia', 'geladeira', 'livro', 'relógio', 'vaso', 'tesoura', 'urso de pelúcia',
  'secador de cabelo', 'escova de dentes',
] as const;

export const PERSON = 0;

export const labels = (lang: 'pt' | 'en'): readonly string[] => (lang === 'pt' ? COCO_PT : COCO_EN);
