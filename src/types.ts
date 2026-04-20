// --- Best of Congo ---

export interface BocSale {
  buyerName: string;
  buyerLogoUrl?: string;
  bagsSold: number; // 60kg bags
  pricePerLb: number; // USD per lb
}

export interface EditionParticipant {
  coopId: string;       // matches /cooperatives doc ID
  qtySubmitted: number; // kg
  cuppingScore: number;
  rank?: number;
  sales: BocSale[];
}

export interface BestOfCongoEdition {
  year: number;    // also the Firestore doc ID as a string (e.g. "2024")
  theme?: string;
  // participants stored as subcollection: /bestofcongo_editions/{year}/participants/{coopId}
}

// --- Cooperative ---

export interface SensoryProfile {
  aroma: number;
  acidity: number;
  body: number;
  sweetness: number;
  aftertaste: number;
}

export interface ProductionYear {
  year: number;
  quantity: number;
  revenue: number;
}

export interface CoffeeCooperative {
  id: string;
  name: string;
  country: string;
  region: string;
  established: number;
  members: number;
  menMembers?: number;
  womenMembers?: number;
  youthMembers?: number;
  altitudeRange: [number, number];
  varieties: string[];
  processingMethods: string[];
  certifications: string[];
  annualProduction: number; // in tons
  selfReportedCuppingScore: number;
  commodity?: 'coffee' | 'cocoa';
  managerEmail?: string;
  isBocParticipant?: boolean;
  sensoryProfile: SensoryProfile;
  description: string;
  sustainabilityFocus: string[];
  imageUrl: string;
  logoUrl: string;
  areaHa?: number;
  treeCount?: number;
  productionHistory?: ProductionYear[];
  households?: number;
}

export const MOCK_COOPERATIVES: CoffeeCooperative[] = [
  {
    id: "drc-olame-1",
    name: "CA OLAME",
    country: "DR Congo",
    region: "Idjwi, Sud-Kivu",
    established: 2019,
    members: 1245,
    altitudeRange: [1450, 1750],
    varieties: ["Bourbon"],
    processingMethods: ["Fully Washed"],
    certifications: ["Organic (In Conversion)"],
    annualProduction: 57.6,
    selfReportedCuppingScore: 85.0,
    areaHa: 374,
    treeCount: 9486902,
    households: 192,
    productionHistory: [
      { year: 2023, quantity: 0.65, revenue: 4547.60 },
      { year: 2024, quantity: 5.0, revenue: 35021.40 },
      { year: 2025, quantity: 5.7, revenue: 45298.62 }
    ],
    sensoryProfile: {
      aroma: 8,
      acidity: 7,
      body: 8,
      sweetness: 8,
      aftertaste: 7,
    },
    description: "CA OLAME (Vivre par notre café et pour notre café) is located on Idjwi Island. They focus on sustainable production, agroforestry, and socio-economic potential of their members through high-quality services.",
    sustainabilityFocus: ["Agroforestry", "Soil conservation", "Organic composting", "Integrated pest management"],
    imageUrl: "https://picsum.photos/seed/olame/800/600",
    logoUrl: "https://picsum.photos/seed/olame-logo/200/200",
  },
  {
    id: "drc-buuma-1",
    name: "BUUMA KAWA",
    country: "DR Congo",
    region: "Masisi, Nord-Kivu",
    established: 2019,
    members: 300,
    menMembers: 165,
    womenMembers: 135,
    youthMembers: 90,
    altitudeRange: [1530, 1800],
    varieties: ["Arabica"],
    processingMethods: ["Fully Washed"],
    certifications: ["Sustainable", "Traceable"],
    annualProduction: 75,
    selfReportedCuppingScore: 83.0,
    areaHa: 450,
    treeCount: 900000,
    households: 300,
    productionHistory: [
      { year: 2024, quantity: 3.5, revenue: 17500 },
      { year: 2025, quantity: 1.3865, revenue: 9012.25 }
    ],
    sensoryProfile: {
      aroma: 7,
      acidity: 7,
      body: 8,
      sweetness: 7,
      aftertaste: 7,
    },
    description: "BUUMA KAWA focuses on sustainable coffee production and biodiversity protection in the Masisi territory. They aim to provide high-quality, traceable coffee while improving local livelihoods.",
    sustainabilityFocus: ["Agroforestry", "Biodiversity conservation", "Water management", "Soil protection"],
    imageUrl: "https://picsum.photos/seed/buuma/800/600",
    logoUrl: "https://picsum.photos/seed/buuma-logo/200/200",
  },
  {
    id: "drc-tujenge-1",
    name: "TUJENGE KIVU",
    country: "DR Congo",
    region: "Masisi (Nord-Kivu) & Kalehe (Sud-Kivu)",
    established: 2020,
    members: 640,
    menMembers: 370,
    womenMembers: 270,
    altitudeRange: [1565, 1565],
    varieties: ["Arabica"],
    processingMethods: ["Fully Washed"],
    certifications: ["Bio (In Prep)", "Rainforest Alliance (In Prep)"],
    annualProduction: 124.8,
    selfReportedCuppingScore: 85.5,
    areaHa: 184,
    treeCount: 457031,
    productionHistory: [
      { year: 2024, quantity: 0.54, revenue: 3780 },
      { year: 2025, quantity: 3.59, revenue: 25070.5 }
    ],
    sensoryProfile: {
      aroma: 8,
      acidity: 8,
      body: 8,
      sweetness: 8,
      aftertaste: 8,
    },
    description: "TUJENGE KIVU (Construisons le KIVU) promotes organic coffee culture to improve farmers' socio-economic conditions. They focus on specialty coffee production with a strong emphasis on gender equality and community support.",
    sustainabilityFocus: ["Agroforestry", "Soil conservation", "Organic compost", "GPS mapping & Traceability"],
    imageUrl: "https://picsum.photos/seed/tujenge/800/600",
    logoUrl: "https://picsum.photos/seed/tujenge-logo/200/200",
  },
  {
    id: "drc-ushindi-1",
    name: "Ushindi Coffee",
    country: "DR Congo",
    region: "Minova, Kalehe, Nord-Kivu",
    established: 2019,
    members: 450,
    menMembers: 295,
    womenMembers: 155,
    altitudeRange: [1450, 1800],
    varieties: ["Bourbon", "Jackson"],
    processingMethods: ["Washed", "Natural"],
    certifications: ["Organic (In Conversion)", "Fairtrade"],
    annualProduction: 48.7,
    selfReportedCuppingScore: 85.5,
    areaHa: 232.6,
    treeCount: 152280,
    sensoryProfile: {
      aroma: 8,
      acidity: 8,
      body: 7,
      sweetness: 8,
      aftertaste: 8,
    },
    description: "Ushindi (Victory) was founded by 4 producers focused on emerging the coffee sector. Their mission is to unlock socio-economic potential through high-quality agricultural services and poverty reduction.",
    sustainabilityFocus: ["Gender promotion", "Environment protection", "Farmer training"],
    imageUrl: "https://picsum.photos/seed/ushindi/800/600",
    logoUrl: "https://picsum.photos/seed/ushindi-logo/200/200",
  },
  {
    id: "eth-yirg-1",
    name: "Yirgacheffe Union",
    country: "Ethiopia",
    region: "Yirgacheffe",
    established: 2002,
    members: 45000,
    altitudeRange: [1700, 2200],
    varieties: ["Heirloom"],
    processingMethods: ["Washed", "Natural"],
    certifications: ["Fairtrade", "Organic"],
    annualProduction: 12000,
    selfReportedCuppingScore: 88.5,
    sensoryProfile: {
      aroma: 9,
      acidity: 9,
      body: 6,
      sweetness: 8,
      aftertaste: 8,
    },
    description: "Renowned for producing some of the most distinctively floral and citrusy coffees in the world.",
    sustainabilityFocus: ["Water conservation", "Reforestation"],
    imageUrl: "https://picsum.photos/seed/yirg/800/600",
    logoUrl: "https://picsum.photos/seed/yirg-logo/200/200",
  },
  {
    id: "rwa-mus-1",
    name: "Abakundakawa",
    country: "Rwanda",
    region: "Gakenke",
    established: 2004,
    members: 2000,
    altitudeRange: [1700, 2000],
    varieties: ["Bourbon"],
    processingMethods: ["Washed"],
    certifications: ["Fairtrade", "Organic"],
    annualProduction: 1500,
    selfReportedCuppingScore: 87.5,
    sensoryProfile: {
      aroma: 8,
      acidity: 8,
      body: 7,
      sweetness: 8,
      aftertaste: 9,
    },
    description: "Famous for their 'Hingakawa' women's coffee association and exceptional Bourbon variety.",
    sustainabilityFocus: ["Women's empowerment", "Organic composting"],
    imageUrl: "https://picsum.photos/seed/rwanda/800/600",
    logoUrl: "https://picsum.photos/seed/rwanda-logo/200/200",
  }
];
