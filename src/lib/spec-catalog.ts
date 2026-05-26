// AUTO-GENERATED from CONCENTRADO ESPECIFICACIONES MQ4 25-05-26.xlsx
// Catálogo de especificaciones de calidad por código de fabricación.
import type { QualityVariable } from "./qc-data";

export interface ProductSpec {
  code: string;
  family: string;
  name: string;
  variables: QualityVariable[];
}

export const PRODUCT_SPECS: ProductSpec[] = [
  {
    "code": "PHR01",
    "family": "PAPEL HIGIENICO",
    "name": "Papel Higienico · PHR01",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 12.7,
        "objective": 13,
        "max": 13.3
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 5,
        "objective": 6,
        "max": 7
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.75,
        "objective": 0.85,
        "max": 0.95
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 72,
        "objective": 74,
        "max": 76
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 400,
        "objective": 450,
        "max": 495
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 250,
        "objective": 280,
        "max": 310
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.4,
        "objective": 1.6,
        "max": 1.8
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 12,
        "objective": 14,
        "max": 16
      }
    ]
  },
  {
    "code": "PHC02",
    "family": "PAPEL HIGIENICO",
    "name": "Papel Higienico · PHC02",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 13.7,
        "objective": 14,
        "max": 14.3
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 5,
        "objective": 6,
        "max": 7
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.5,
        "objective": 0.6,
        "max": 0.7
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 80,
        "objective": 82,
        "max": 84
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 567,
        "objective": 630,
        "max": 693
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 378,
        "objective": 420,
        "max": 462
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.3,
        "objective": 1.5,
        "max": 1.8
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 14,
        "objective": 16,
        "max": 18
      }
    ]
  },
  {
    "code": "PHC01",
    "family": "PAPEL HIGIENICO",
    "name": "Papel Higienico · PHC01",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 12.7,
        "objective": 13,
        "max": 13.3
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 5,
        "objective": 6,
        "max": 7
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.45,
        "objective": 0.5,
        "max": 0.55
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 80,
        "objective": 82,
        "max": 84
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 425,
        "objective": 500,
        "max": 575
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 250,
        "objective": 280,
        "max": 310
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.6,
        "objective": 1.8,
        "max": 2
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 12,
        "objective": 14,
        "max": 16
      }
    ]
  },
  {
    "code": "PHR03",
    "family": "PAPEL HIGIENICO",
    "name": "Papel Higienico · PHR03",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 21.7,
        "objective": 22,
        "max": 22.3
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 5,
        "objective": 6,
        "max": 7
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.95,
        "objective": 1,
        "max": 1.05
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 72,
        "objective": 74,
        "max": 76
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 1260,
        "objective": 1400,
        "max": 1540
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 700,
        "objective": 780,
        "max": 860
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.7,
        "objective": 1.8,
        "max": 1.9
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 16,
        "objective": 18,
        "max": 20
      }
    ]
  },
  {
    "code": "PHR11",
    "family": "PAPEL HIGIENICO",
    "name": "Papel Higienico · PHR11",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 13,
        "objective": 13.5,
        "max": 14
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 5,
        "objective": 6,
        "max": 7
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.45,
        "objective": 0.5,
        "max": 0.55
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 72,
        "objective": 74,
        "max": 76
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 460,
        "objective": 520,
        "max": 580
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 250,
        "objective": 280,
        "max": 310
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.6,
        "objective": 1.8,
        "max": 2
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 12,
        "objective": 14,
        "max": 16
      }
    ]
  },
  {
    "code": "PHC03",
    "family": "PAPEL HIGIENICO",
    "name": "Papel Higienico · PHC03",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 13.7,
        "objective": 14,
        "max": 14.3
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 5,
        "objective": 6,
        "max": 7
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.7,
        "objective": 0.8,
        "max": 0.9
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 80,
        "objective": 82,
        "max": 84
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 500,
        "objective": 570,
        "max": 650
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 280,
        "objective": 310,
        "max": 340
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.6,
        "objective": 1.8,
        "max": 2
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 18,
        "objective": 20,
        "max": 22
      }
    ]
  },
  {
    "code": "PSR01",
    "family": "PAPEL SERVILLETA",
    "name": "Papel Servilleta · PSR01",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 16.2,
        "objective": 16.5,
        "max": 16.8
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 4,
        "objective": 6,
        "max": 7
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.65,
        "objective": 0.75,
        "max": 0.85
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 76,
        "objective": 78,
        "max": 80
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 900,
        "objective": 1000,
        "max": 1100
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 750,
        "objective": 833,
        "max": 917
      },
      {
        "key": "tensionRH",
        "label": "Tensión RH",
        "unit": "g/in",
        "min": 180,
        "objective": 200,
        "max": 220
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.1,
        "objective": 1.2,
        "max": 1.3
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 10,
        "objective": 12,
        "max": 14
      }
    ]
  },
  {
    "code": "PSM01",
    "family": "PAPEL SERVILLETA",
    "name": "Papel Servilleta · PSM01",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 16.2,
        "objective": 16.5,
        "max": 16.8
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 5,
        "objective": 6,
        "max": 7
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.65,
        "objective": 0.75,
        "max": 0.85
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 78,
        "objective": 80,
        "max": 82
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 990,
        "objective": 1100,
        "max": 1210
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 700,
        "objective": 785,
        "max": 870
      },
      {
        "key": "tensionRH",
        "label": "Tensión RH",
        "unit": "g/in",
        "min": 150,
        "objective": 165,
        "max": 180
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.3,
        "objective": 1.4,
        "max": 1.5
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 8,
        "objective": 10,
        "max": 12
      }
    ]
  },
  {
    "code": "PSC01",
    "family": "PAPEL SERVILLETA",
    "name": "Papel Servilleta · PSC01",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 17.2,
        "objective": 17.5,
        "max": 17.8
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 5,
        "objective": 6,
        "max": 7
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.75,
        "objective": 0.85,
        "max": 0.95
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 80,
        "objective": 82,
        "max": 84
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 1080,
        "objective": 1200,
        "max": 1320
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 775,
        "objective": 860,
        "max": 945
      },
      {
        "key": "tensionRH",
        "label": "Tensión RH",
        "unit": "g/in",
        "min": 160,
        "objective": 180,
        "max": 200
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.3,
        "objective": 1.4,
        "max": 1.5
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 8,
        "objective": 10,
        "max": 12
      }
    ]
  },
  {
    "code": "PSC02",
    "family": "PAPEL SERVILLETA",
    "name": "Papel Servilleta · PSC02",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 28.7,
        "objective": 29,
        "max": 29.3
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 5,
        "objective": 6,
        "max": 7
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.8,
        "objective": 0.9,
        "max": 1
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 80,
        "objective": 82,
        "max": 84
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 1440,
        "objective": 1600,
        "max": 1760
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 1025,
        "objective": 1140,
        "max": 1255
      },
      {
        "key": "tensionRH",
        "label": "Tensión RH",
        "unit": "g/in",
        "min": 215,
        "objective": 240,
        "max": 260
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.3,
        "objective": 1.4,
        "max": 1.5
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 6,
        "objective": 8,
        "max": 10
      }
    ]
  },
  {
    "code": "PSC10",
    "family": "PAPEL SERVILLETA",
    "name": "Papel Servilleta · PSC10",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 18.7,
        "objective": 19,
        "max": 19.3
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 5,
        "objective": 6,
        "max": 7
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.75,
        "objective": 0.85,
        "max": 0.95
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 80,
        "objective": 82,
        "max": 84
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 1050,
        "objective": 1200,
        "max": 1320
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 775,
        "objective": 860,
        "max": 945
      },
      {
        "key": "tensionRH",
        "label": "Tensión RH",
        "unit": "g/in",
        "min": 160,
        "objective": 180,
        "max": 200
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.3,
        "objective": 1.4,
        "max": 1.5
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 8,
        "objective": 10,
        "max": 12
      }
    ]
  },
  {
    "code": "PSR11",
    "family": "PAPEL SERVILLETA",
    "name": "Papel Servilleta · PSR11",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 20.3,
        "objective": 20.8,
        "max": 21.3
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 3,
        "objective": 4,
        "max": 5
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.9,
        "objective": 1,
        "max": 1.1
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 76,
        "objective": 78,
        "max": 80
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 1260,
        "objective": 1430,
        "max": 1560
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 858,
        "objective": 953,
        "max": 1049
      },
      {
        "key": "tensionRH",
        "label": "Tensión RH",
        "unit": "g/in",
        "min": 296,
        "objective": 329,
        "max": 362
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.3,
        "objective": 1.5,
        "max": 1.6
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 4,
        "objective": 6,
        "max": 8
      }
    ]
  },
  {
    "code": "PSR12",
    "family": "PAPEL SERVILLETA",
    "name": "Papel Servilleta · PSR12",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 18.5,
        "objective": 19,
        "max": 19.5
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 3,
        "objective": 4,
        "max": 5
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.7,
        "objective": 0.8,
        "max": 0.9
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 76,
        "objective": 78,
        "max": 80
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 1062,
        "objective": 1180,
        "max": 1298
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 708,
        "objective": 787,
        "max": 865
      },
      {
        "key": "tensionRH",
        "label": "Tensión RH",
        "unit": "g/in",
        "min": 244,
        "objective": 271,
        "max": 299
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.4,
        "objective": 1.5,
        "max": 1.7
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 5,
        "objective": 7,
        "max": 9
      }
    ]
  },
  {
    "code": "PSR13",
    "family": "PAPEL SERVILLETA",
    "name": "Papel Servilleta · PSR13",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 18,
        "objective": 18.5,
        "max": 19
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 3,
        "objective": 4,
        "max": 5
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.6,
        "objective": 0.7,
        "max": 0.8
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 76,
        "objective": 78,
        "max": 80
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 790,
        "objective": 960,
        "max": 1090
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 576,
        "objective": 640,
        "max": 704
      },
      {
        "key": "tensionRH",
        "label": "Tensión RH",
        "unit": "g/in",
        "min": 199,
        "objective": 221,
        "max": 243
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.2,
        "objective": 1.5,
        "max": 1.7
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 5,
        "objective": 7,
        "max": 9
      }
    ]
  },
  {
    "code": "PSIM01",
    "family": "PAPEL SERVILLETA INTERDOBLADA",
    "name": "Papel Servilleta Interdoblada · PSIM01",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 24.7,
        "objective": 25,
        "max": 25.3
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 5,
        "objective": 6,
        "max": 7
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.7,
        "objective": 0.8,
        "max": 0.9
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 78,
        "objective": 80,
        "max": 82
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 2070,
        "objective": 2300,
        "max": 2530
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 1374,
        "objective": 1544,
        "max": 1700
      },
      {
        "key": "tensionRH",
        "label": "Tensión RH",
        "unit": "g/in",
        "min": 312,
        "objective": 345,
        "max": 359
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.4,
        "objective": 1.5,
        "max": 1.6
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 15,
        "objective": 16,
        "max": 17
      }
    ]
  },
  {
    "code": "PSIM02",
    "family": "PAPEL SERVILLETA INTERDOBLADA",
    "name": "Papel Servilleta Interdoblada · PSIM02",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 22.2,
        "objective": 22.5,
        "max": 22.8
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 5,
        "objective": 6,
        "max": 7
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.65,
        "objective": 0.75,
        "max": 0.85
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 78,
        "objective": 80,
        "max": 82
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 1890,
        "objective": 2100,
        "max": 2310
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 1235,
        "objective": 1373,
        "max": 1511
      },
      {
        "key": "tensionRH",
        "label": "Tensión RH",
        "unit": "g/in",
        "min": 284,
        "objective": 315,
        "max": 328
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.4,
        "objective": 1.5,
        "max": 1.6
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 15,
        "objective": 16,
        "max": 17
      }
    ]
  },
  {
    "code": "PSTR01",
    "family": "PAPEL SERVITOALLA",
    "name": "Papel Servitoalla · PSTR01",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 19,
        "objective": 19.5,
        "max": 20
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 5,
        "objective": 6,
        "max": 7
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.65,
        "objective": 0.75,
        "max": 0.85
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 76,
        "objective": 78,
        "max": 80
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 1130,
        "objective": 1300,
        "max": 1430
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 790,
        "objective": 880,
        "max": 970
      },
      {
        "key": "tensionRH",
        "label": "Tensión RH",
        "unit": "g/in",
        "min": 235,
        "objective": 260,
        "max": 270
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.3,
        "objective": 1.5,
        "max": 1.7
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 12,
        "objective": 14,
        "max": 16
      }
    ]
  },
  {
    "code": "PTR01",
    "family": "PAPEL TOALLA",
    "name": "Papel Toalla · PTR01",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 26.7,
        "objective": 27,
        "max": 27.3
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 5,
        "objective": 6,
        "max": 7
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.65,
        "objective": 0.75,
        "max": 0.85
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 72,
        "objective": 74,
        "max": 76
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 1440,
        "objective": 1600,
        "max": 1760
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 900,
        "objective": 1000,
        "max": 1100
      },
      {
        "key": "tensionRH",
        "label": "Tensión RH",
        "unit": "g/in",
        "min": 360,
        "objective": 400,
        "max": 440
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.4,
        "objective": 1.6,
        "max": 1.8
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 6,
        "objective": 8,
        "max": 10
      }
    ]
  },
  {
    "code": "PTR02",
    "family": "PAPEL TOALLA",
    "name": "Papel Toalla · PTR02",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 15,
        "objective": 15.5,
        "max": 16
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 4,
        "objective": 6,
        "max": 7
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.6,
        "objective": 0.7,
        "max": 0.8
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 74,
        "objective": 77,
        "max": 80
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 900,
        "objective": 1000,
        "max": 1100
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 600,
        "objective": 670,
        "max": 740
      },
      {
        "key": "tensionRH",
        "label": "Tensión RH",
        "unit": "g/in",
        "min": 225,
        "objective": 250,
        "max": 275
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.4,
        "objective": 1.5,
        "max": 1.6
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 6,
        "objective": 8,
        "max": 10
      }
    ]
  },
  {
    "code": "PTR10",
    "family": "PAPEL TOALLA",
    "name": "Papel Toalla · PTR10",
    "variables": [
      {
        "key": "pesoBase",
        "label": "Peso base",
        "unit": "g/m²",
        "min": 28.7,
        "objective": 29,
        "max": 29.3
      },
      {
        "key": "humedad",
        "label": "Humedad",
        "unit": "%",
        "min": 5,
        "objective": 6,
        "max": 7
      },
      {
        "key": "calibre",
        "label": "Calibre",
        "unit": "mm",
        "min": 0.9,
        "objective": 1,
        "max": 1.1
      },
      {
        "key": "blancura",
        "label": "Blancura",
        "unit": "%",
        "min": 72,
        "objective": 74,
        "max": 76
      },
      {
        "key": "tensionMD",
        "label": "Tensión MD",
        "unit": "g/in",
        "min": 1620,
        "objective": 1800,
        "max": 1980
      },
      {
        "key": "tensionCD",
        "label": "Tensión CD",
        "unit": "g/in",
        "min": 1072,
        "objective": 1200,
        "max": 1320
      },
      {
        "key": "tensionRH",
        "label": "Tensión RH",
        "unit": "g/in",
        "min": 405,
        "objective": 450,
        "max": 495
      },
      {
        "key": "relMDCD",
        "label": "Relación MD/CD",
        "unit": "",
        "min": 1.4,
        "objective": 1.5,
        "max": 1.7
      },
      {
        "key": "elongMD",
        "label": "Elongación",
        "unit": "%",
        "min": 6,
        "objective": 8,
        "max": 10
      }
    ]
  }
];

export const PRODUCT_SPEC_MAP: Record<string, ProductSpec> =
  Object.fromEntries(PRODUCT_SPECS.map((p) => [p.code, p]));

export const PRODUCT_FAMILIES = Array.from(
  new Set(PRODUCT_SPECS.map((p) => p.family))
);
