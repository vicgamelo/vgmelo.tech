// Bases da demo de PCA. Os dados ficam em arquivos separados e só são baixados quando a base é
// escolhida (import dinâmico vira um chunk próprio no build).
import { IRIS } from './iris';

type Lang = 'pt' | 'en';
type Text = Record<Lang, string>;

export interface PcaData {
  X: number[][];
  y: number[];
}

export interface PcaDataset {
  key: 'iris' | 'wine' | 'cancer' | 'digits';
  name: Text;
  desc: Text;
  classes: Record<Lang, string[]>;
  features: Record<Lang, string[]>;
  unit: string;
  /** Cor (índice da paleta .c0–.c9) de cada classe; sem isso, classe k usa a cor k. */
  palette?: number[];
  /** Dígitos: mostra a imagem 8×8 na dica em vez das medidas. */
  image?: [number, number];
  load: () => Promise<PcaData>;
}

const WINE_EN = ['Alcohol', 'Malic acid', 'Ash', 'Ash alcalinity', 'Magnesium', 'Total phenols', 'Flavanoids', 'Nonflavanoid phenols', 'Proanthocyanins', 'Color intensity', 'Hue', 'OD280/OD315', 'Proline'];
const WINE_PT = ['Álcool', 'Ácido málico', 'Cinzas', 'Alcalinidade das cinzas', 'Magnésio', 'Fenóis totais', 'Flavonoides', 'Fenóis não flavonoides', 'Proantocianidinas', 'Intensidade de cor', 'Matiz', 'OD280/OD315', 'Prolina'];

const CELL_EN = ['radius', 'texture', 'perimeter', 'area', 'smoothness', 'compactness', 'concavity', 'concave points', 'symmetry', 'fractal dimension'];
const CELL_PT = ['raio', 'textura', 'perímetro', 'área', 'suavidade', 'compacidade', 'concavidade', 'pontos côncavos', 'simetria', 'dimensão fractal'];
const cancerNames = (base: string[], kinds: string[]) => kinds.flatMap((k) => base.map((b) => `${b} (${k})`));

const pixels = Array.from({ length: 64 }, (_, i) => `pixel ${Math.floor(i / 8) + 1},${(i % 8) + 1}`);

export const PCA_DATASETS: PcaDataset[] = [
  {
    key: 'iris',
    name: { pt: 'Iris', en: 'Iris' },
    desc: {
      pt: '150 flores de 3 espécies, com 4 medidas de sépala e pétala. O clássico: duas componentes já separam bem as espécies.',
      en: '150 flowers of 3 species, with 4 sepal and petal measurements. The classic: two components already separate the species well.',
    },
    classes: { pt: ['setosa', 'versicolor', 'virginica'], en: ['setosa', 'versicolor', 'virginica'] },
    features: {
      pt: ['Comp. sépala', 'Larg. sépala', 'Comp. pétala', 'Larg. pétala'],
      en: ['Sepal length', 'Sepal width', 'Petal length', 'Petal width'],
    },
    unit: 'cm',
    load: async () => ({ X: IRIS.map((r) => r.slice(0, 4)), y: IRIS.map((r) => r[4]) }),
  },
  {
    key: 'wine',
    name: { pt: 'Vinhos', en: 'Wine' },
    desc: {
      pt: '178 vinhos de 3 cultivares da Itália, com 13 medidas químicas. Sem padronizar, a prolina (na casa dos milhares) engole todo o resto.',
      en: '178 wines from 3 Italian cultivars, with 13 chemical measurements. Without standardizing, proline (in the thousands) swallows everything else.',
    },
    classes: { pt: ['cultivar 1', 'cultivar 2', 'cultivar 3'], en: ['cultivar 1', 'cultivar 2', 'cultivar 3'] },
    features: { pt: WINE_PT, en: WINE_EN },
    unit: '',
    load: () => import('./pca/wine'),
  },
  {
    key: 'cancer',
    name: { pt: 'Câncer de mama', en: 'Breast cancer' },
    desc: {
      pt: '569 exames com 30 medidas dos núcleos das células (média, erro e pior valor de 10 características). O PC1 sozinho quase separa maligno de benigno.',
      en: '569 exams with 30 measurements of the cell nuclei (mean, error and worst value of 10 features). PC1 alone almost separates malignant from benign.',
    },
    classes: { pt: ['maligno', 'benigno'], en: ['malignant', 'benign'] },
    palette: [3, 0],
    features: { pt: cancerNames(CELL_PT, ['média', 'erro', 'pior']), en: cancerNames(CELL_EN, ['mean', 'error', 'worst']) },
    unit: '',
    load: () => import('./pca/cancer'),
  },
  {
    key: 'digits',
    name: { pt: 'Dígitos', en: 'Digits' },
    desc: {
      pt: '600 dígitos escritos à mão, cada um com 8×8 pixels: 64 dimensões. Aqui a informação se espalha por muitas componentes, e o 2D mostra só uma parte.',
      en: '600 handwritten digits, each 8×8 pixels: 64 dimensions. Here the information spreads over many components, and 2D shows only part of it.',
    },
    classes: { pt: '0123456789'.split(''), en: '0123456789'.split('') },
    features: { pt: pixels, en: pixels },
    unit: '',
    image: [8, 8],
    load: () => import('./pca/digits'),
  },
];
