import { v4 as uuid } from "uuid";
import type {
  Seller, Category, Product, Cart, Order, Review, Coupon, WishlistItem, Address,
} from "../types/marketplace.js";

const rand  = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randF = (min: number, max: number) => +(Math.random() * (max - min) + min).toFixed(2);
const ago   = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const future = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

// ─── Categories ───────────────────────────────────────────────────────────────
export const CATEGORIES: Category[] = [
  { id:"cat-01", name:"Electronics",      slug:"electronics",    icon:"💻", parentId:null, productCount:0, featured:true  },
  { id:"cat-02", name:"Fashion",          slug:"fashion",        icon:"👗", parentId:null, productCount:0, featured:true  },
  { id:"cat-03", name:"Home & Garden",    slug:"home-garden",    icon:"🏠", parentId:null, productCount:0, featured:true  },
  { id:"cat-04", name:"Health & Beauty",  slug:"health-beauty",  icon:"💄", parentId:null, productCount:0, featured:true  },
  { id:"cat-05", name:"Sports",           slug:"sports",         icon:"⚽", parentId:null, productCount:0, featured:true  },
  { id:"cat-06", name:"Books & Media",    slug:"books-media",    icon:"📚", parentId:null, productCount:0, featured:false },
  { id:"cat-07", name:"Toys & Kids",      slug:"toys-kids",      icon:"🧸", parentId:null, productCount:0, featured:false },
  { id:"cat-08", name:"Automotive",       slug:"automotive",     icon:"🚗", parentId:null, productCount:0, featured:false },
  { id:"cat-09", name:"Office & Business",slug:"office-business",icon:"💼", parentId:null, productCount:0, featured:false },
];

// ─── Sellers ──────────────────────────────────────────────────────────────────
export const SELLERS: Seller[] = [
  { id:"sel-01", userId:"u-s-01", storeName:"TechZone SA",    storeSlug:"techzone-sa",    description:"South Africa's leading electronics retailer",  logoUrl:null, bannerUrl:null, email:"store@techzone.co.za",  phone:"+27111000001", country:"ZA", status:"active", kycVerified:true,  taxId:"4190184766", totalProducts:0, totalSales:1842, totalRevenue:2_480_000, avgRating:4.7, reviewCount:1200, joinedAt:ago(43800), commissionPct:8  },
  { id:"sel-02", userId:"u-s-02", storeName:"Fashion Hub",    storeSlug:"fashion-hub",    description:"Trendy clothing for the modern African",        logoUrl:null, bannerUrl:null, email:"store@fashionhub.co.za", phone:"+27111000002", country:"ZA", status:"active", kycVerified:true,  taxId:"4190184767", totalProducts:0, totalSales:934,  totalRevenue:480_000,   avgRating:4.5, reviewCount:640,  joinedAt:ago(30000), commissionPct:10 },
  { id:"sel-03", userId:"u-s-03", storeName:"HomeStyle",      storeSlug:"homestyle",      description:"Quality furniture and home décor",              logoUrl:null, bannerUrl:null, email:"store@homestyle.co.za",  phone:"+27111000003", country:"ZA", status:"active", kycVerified:true,  taxId:"4190184768", totalProducts:0, totalSales:521,  totalRevenue:920_000,   avgRating:4.6, reviewCount:380,  joinedAt:ago(25000), commissionPct:9  },
  { id:"sel-04", userId:"u-s-04", storeName:"SportsPro",      storeSlug:"sportspro",      description:"Professional sporting goods & fitness",         logoUrl:null, bannerUrl:null, email:"store@sportspro.co.za",  phone:"+27111000004", country:"ZA", status:"active", kycVerified:true,  taxId:"4190184769", totalProducts:0, totalSales:683,  totalRevenue:340_000,   avgRating:4.4, reviewCount:290,  joinedAt:ago(20000), commissionPct:8  },
  { id:"sel-05", userId:"u-s-05", storeName:"BeautyBar",      storeSlug:"beautybar",      description:"Premium skincare & cosmetics",                  logoUrl:null, bannerUrl:null, email:"store@beautybar.co.za",  phone:"+27111000005", country:"ZA", status:"active", kycVerified:true,  taxId:"4190184770", totalProducts:0, totalSales:1103, totalRevenue:210_000,   avgRating:4.8, reviewCount:820,  joinedAt:ago(18000), commissionPct:12 },
  { id:"sel-06", userId:"u-s-06", storeName:"BookWorld",      storeSlug:"bookworld",      description:"Books, eBooks, music and film",                 logoUrl:null, bannerUrl:null, email:"store@bookworld.co.za",  phone:"+27111000006", country:"ZA", status:"active", kycVerified:true,  taxId:"4190184771", totalProducts:0, totalSales:298,  totalRevenue:45_000,    avgRating:4.3, reviewCount:180,  joinedAt:ago(15000), commissionPct:6  },
];

// ─── Products ─────────────────────────────────────────────────────────────────
const PRODUCTS_SEED: Omit<Product, "id" | "slug" | "createdAt" | "updatedAt">[] = [
  // Electronics
  { sellerId:"sel-01", sellerName:"TechZone SA",   categoryId:"cat-01", categoryName:"Electronics",     name:"Samsung Galaxy S25 Ultra",     shortDescription:"6.8\" Dynamic AMOLED, 200MP camera, S Pen included",    description:"The Samsung Galaxy S25 Ultra represents the pinnacle of smartphone technology.",                           price:22999, compareAtPrice:25999, currency:"ZAR", images:["#1a1a2e","#16213e"], emoji:"📱", status:"active", stock:48,  sku:"SAM-S25U",    brand:"Samsung",  tags:["flagship","android","5g"],     attributes:{Storage:"512GB",RAM:"12GB",Color:"Phantom Black"}, variants:[{id:uuid(),type:"color",value:"Phantom Black",additionalPrice:0,stock:28,sku:"SAM-S25U-BLK"},{id:uuid(),type:"color",value:"Titanium",additionalPrice:0,stock:20,sku:"SAM-S25U-TIT"}], avgRating:4.8, reviewCount:342, totalSold:184, isFeatured:true,  isFlashDeal:false, flashDealEndsAt:null },
  { sellerId:"sel-01", sellerName:"TechZone SA",   categoryId:"cat-01", categoryName:"Electronics",     name:"Apple MacBook Pro 14\" M4",     shortDescription:"Apple M4 chip, 14-core GPU, 16GB RAM, 512GB SSD",       description:"The MacBook Pro 14 with M4 chip delivers extraordinary performance.",                                       price:36999, compareAtPrice:39999, currency:"ZAR", images:["#2d3748","#1a202c"], emoji:"💻", status:"active", stock:22,  sku:"APPL-MBP14M4", brand:"Apple",    tags:["laptop","macos","professional"], attributes:{RAM:"16GB",Storage:"512GB",Color:"Space Black"},    variants:[{id:uuid(),type:"style",value:"16GB / 512GB",additionalPrice:0,stock:22,sku:"MBP14-16-512"}],                                                                                    avgRating:4.9, reviewCount:218, totalSold:96,  isFeatured:true,  isFlashDeal:false, flashDealEndsAt:null },
  { sellerId:"sel-01", sellerName:"TechZone SA",   categoryId:"cat-01", categoryName:"Electronics",     name:"Sony WH-1000XM6 Headphones",   shortDescription:"Industry-leading noise cancellation, 40h battery",       description:"Experience unparalleled sound quality with Sony's flagship headphones.",                                     price:5999,  compareAtPrice:7499,  currency:"ZAR", images:["#1a1a2e","#2d3748"], emoji:"🎧", status:"active", stock:85,  sku:"SONY-WH1000X",  brand:"Sony",     tags:["audio","wireless","anc"],       attributes:{Color:"Black",BatteryLife:"40 Hours"},              variants:[{id:uuid(),type:"color",value:"Black",additionalPrice:0,stock:50,sku:"SONY-WH-BLK"},{id:uuid(),type:"color",value:"Silver",additionalPrice:0,stock:35,sku:"SONY-WH-SLV"}],  avgRating:4.7, reviewCount:520, totalSold:340, isFeatured:false, isFlashDeal:true,  flashDealEndsAt:future(1) },
  { sellerId:"sel-01", sellerName:"TechZone SA",   categoryId:"cat-01", categoryName:"Electronics",     name:"Samsung 65\" QLED 4K TV",      shortDescription:"Quantum HDR, 120Hz, Smart TV with Alexa built-in",       description:"Transform your living room with the Samsung 65 QLED 4K Smart TV.",                                          price:18999, compareAtPrice:22999, currency:"ZAR", images:["#0a0a0a","#1a1a2e"], emoji:"📺", status:"active", stock:15,  sku:"SAM-65QLED",   brand:"Samsung",  tags:["tv","4k","smart"],              attributes:{Size:"65 inch",Resolution:"4K"},                    variants:[{id:uuid(),type:"style",value:"65 inch",additionalPrice:0,stock:15,sku:"SAM-65Q-65"}],                                                                                            avgRating:4.6, reviewCount:89,  totalSold:52,  isFeatured:false, isFlashDeal:false, flashDealEndsAt:null },
  { sellerId:"sel-01", sellerName:"TechZone SA",   categoryId:"cat-01", categoryName:"Electronics",     name:"Apple Watch Series 10",        shortDescription:"Heart rate, ECG, crash detection, 18h battery",          description:"Apple Watch Series 10 is the most advanced Apple Watch ever.",                                              price:12999, compareAtPrice:14999, currency:"ZAR", images:["#1c1c1e","#2d3748"], emoji:"⌚", status:"active", stock:63,  sku:"APPL-AW10",    brand:"Apple",    tags:["smartwatch","fitness","health"], attributes:{Case:"Titanium",Band:"Sport Loop"},                 variants:[{id:uuid(),type:"size",value:"42mm",additionalPrice:0,stock:40,sku:"AW10-42"},{id:uuid(),type:"size",value:"46mm",additionalPrice:500,stock:23,sku:"AW10-46"}],               avgRating:4.8, reviewCount:175, totalSold:88,  isFeatured:true,  isFlashDeal:false, flashDealEndsAt:null },
  // Fashion
  { sellerId:"sel-02", sellerName:"Fashion Hub",   categoryId:"cat-02", categoryName:"Fashion",         name:"Nike Air Max 270",             shortDescription:"Lifestyle sneaker with Max Air unit, breathable mesh",    description:"The Nike Air Max 270 delivers all-day comfort with a large Max Air unit.",                                   price:2499,  compareAtPrice:2999,  currency:"ZAR", images:["#E8E8E8","#FFFFFF"], emoji:"👟", status:"active", stock:120, sku:"NIKE-AM270",   brand:"Nike",     tags:["shoes","sneakers","sport"],     attributes:{Material:"Mesh + Leather"},                         variants:[{id:uuid(),type:"size",value:"7",additionalPrice:0,stock:20,sku:"AM270-7"},{id:uuid(),type:"size",value:"8",additionalPrice:0,stock:30,sku:"AM270-8"},{id:uuid(),type:"size",value:"9",additionalPrice:0,stock:35,sku:"AM270-9"},{id:uuid(),type:"size",value:"10",additionalPrice:0,stock:25,sku:"AM270-10"},{id:uuid(),type:"size",value:"11",additionalPrice:0,stock:10,sku:"AM270-11"}], avgRating:4.6, reviewCount:890, totalSold:620, isFeatured:true,  isFlashDeal:false, flashDealEndsAt:null },
  { sellerId:"sel-02", sellerName:"Fashion Hub",   categoryId:"cat-02", categoryName:"Fashion",         name:"Levi's 501 Original Jeans",    shortDescription:"Classic straight fit, button fly, 100% cotton denim",    description:"The Levi's 501 Original is the original blue jean that defined American style.",                            price:1299,  compareAtPrice:null,  currency:"ZAR", images:["#1a237e","#283593"], emoji:"👖", status:"active", stock:200, sku:"LEVI-501",     brand:"Levi's",   tags:["jeans","denim","classic"],      attributes:{Fit:"Straight",Material:"100% Cotton"},            variants:[{id:uuid(),type:"size",value:"30x30",additionalPrice:0,stock:40,sku:"LEVI-501-3030"},{id:uuid(),type:"size",value:"32x32",additionalPrice:0,stock:60,sku:"LEVI-501-3232"},{id:uuid(),type:"size",value:"34x32",additionalPrice:0,stock:60,sku:"LEVI-501-3432"},{id:uuid(),type:"size",value:"36x34",additionalPrice:0,stock:40,sku:"LEVI-501-3634"}], avgRating:4.5, reviewCount:412, totalSold:380, isFeatured:false, isFlashDeal:true,  flashDealEndsAt:future(1) },
  { sellerId:"sel-02", sellerName:"Fashion Hub",   categoryId:"cat-02", categoryName:"Fashion",         name:"Ray-Ban Classic Aviator",      shortDescription:"Polarized lenses, gold metal frame, UV400 protection",   description:"The iconic Ray-Ban Aviator sunglasses offer timeless style and superior sun protection.",                    price:2899,  compareAtPrice:3499,  currency:"ZAR", images:["#D4AF37","#B8860B"], emoji:"🕶️", status:"active", stock:75,  sku:"RB-3025",      brand:"Ray-Ban",  tags:["sunglasses","fashion","uv"],    attributes:{Frame:"Gold Metal",Lens:"Polarized"},              variants:[],                                                                                                                                                                                    avgRating:4.7, reviewCount:234, totalSold:142, isFeatured:false, isFlashDeal:false, flashDealEndsAt:null },
  // Home & Garden
  { sellerId:"sel-03", sellerName:"HomeStyle",     categoryId:"cat-03", categoryName:"Home & Garden",   name:"KitchenAid Artisan Stand Mixer",shortDescription:"5.7L bowl, 10 speeds, 59 touch points — iconic design",  description:"The KitchenAid Artisan Stand Mixer is the complete kitchen companion.",                                      price:8999,  compareAtPrice:10999, currency:"ZAR", images:["#E53935","#B71C1C"], emoji:"🍳", status:"active", stock:28,  sku:"KA-5KSM175",   brand:"KitchenAid",tags:["kitchen","baking","mixer"],    attributes:{Capacity:"5.7L",Color:"Empire Red"},               variants:[{id:uuid(),type:"color",value:"Empire Red",additionalPrice:0,stock:15,sku:"KA-5KSM-RED"},{id:uuid(),type:"color",value:"Ice Blue",additionalPrice:0,stock:8,sku:"KA-5KSM-BLUE"},{id:uuid(),type:"color",value:"Black",additionalPrice:0,stock:5,sku:"KA-5KSM-BLK"}], avgRating:4.9, reviewCount:182, totalSold:94,  isFeatured:true,  isFlashDeal:false, flashDealEndsAt:null },
  { sellerId:"sel-03", sellerName:"HomeStyle",     categoryId:"cat-03", categoryName:"Home & Garden",   name:"Dyson V15 Detect Cordless",    shortDescription:"Laser dust detection, 60min runtime, HEPA filtration",   description:"The Dyson V15 Detect automatically adapts to different floor types.",                                        price:12999, compareAtPrice:14999, currency:"ZAR", images:["#F9A825","#F57F17"], emoji:"🧹", status:"active", stock:35,  sku:"DYSON-V15",    brand:"Dyson",    tags:["vacuum","cordless","cleaning"], attributes:{BatteryLife:"60 min",Weight:"3.1kg"},               variants:[],                                                                                                                                                                                    avgRating:4.8, reviewCount:267, totalSold:156, isFeatured:false, isFlashDeal:false, flashDealEndsAt:null },
  // Health & Beauty
  { sellerId:"sel-05", sellerName:"BeautyBar",     categoryId:"cat-04", categoryName:"Health & Beauty", name:"The Ordinary Skincare Bundle",  shortDescription:"Hyaluronic Acid, Niacinamide, AHA/BHA Peeling Solution",  description:"The Ordinary offers clinical skincare formulations with integrity at accessible prices.",                     price:599,   compareAtPrice:799,   currency:"ZAR", images:["#FAFAFA","#F5F5F5"], emoji:"💆", status:"active", stock:340, sku:"ORD-BUNDLE-01", brand:"The Ordinary", tags:["skincare","routine","science"], attributes:{SkinType:"All Types",Items:"4"},               variants:[],                                                                                                                                                                                    avgRating:4.7, reviewCount:892, totalSold:740, isFeatured:true,  isFlashDeal:true,  flashDealEndsAt:future(1) },
  { sellerId:"sel-05", sellerName:"BeautyBar",     categoryId:"cat-04", categoryName:"Health & Beauty", name:"Oral-B iO Series 9 Electric Toothbrush", shortDescription:"AI-powered, 7 brushing modes, pressure sensor display", description:"The Oral-B iO Series 9 combines revolutionary micro-vibration technology with AI.",               price:3299,  compareAtPrice:4299,  currency:"ZAR", images:["#1565C0","#0D47A1"], emoji:"🪥", status:"active", stock:62,  sku:"OB-IO9",       brand:"Oral-B",   tags:["dental","electric","health"],   attributes:{Modes:"7",BatteryLife:"14 days"},                  variants:[{id:uuid(),type:"color",value:"Black",additionalPrice:0,stock:35,sku:"OB-IO9-BLK"},{id:uuid(),type:"color",value:"White",additionalPrice:0,stock:27,sku:"OB-IO9-WHT"}],      avgRating:4.6, reviewCount:194, totalSold:112, isFeatured:false, isFlashDeal:false, flashDealEndsAt:null },
  // Sports
  { sellerId:"sel-04", sellerName:"SportsPro",     categoryId:"cat-05", categoryName:"Sports",          name:"Garmin Fenix 8 GPS Watch",     shortDescription:"Multi-sport GPS, AMOLED display, 29-day battery",        description:"The Garmin Fenix 8 is the ultimate multi-sport GPS smartwatch.",                                           price:19999, compareAtPrice:22999, currency:"ZAR", images:["#1a1a2e","#2d3748"], emoji:"🏃", status:"active", stock:18,  sku:"GAR-FENIX8",   brand:"Garmin",   tags:["gps","sport","fitness"],        attributes:{Display:"AMOLED",WaterRating:"100m"},              variants:[{id:uuid(),type:"size",value:"47mm",additionalPrice:0,stock:10,sku:"FENIX8-47"},{id:uuid(),type:"size",value:"51mm",additionalPrice:1000,stock:8,sku:"FENIX8-51"}],          avgRating:4.8, reviewCount:128, totalSold:74,  isFeatured:false, isFlashDeal:false, flashDealEndsAt:null },
  { sellerId:"sel-04", sellerName:"SportsPro",     categoryId:"cat-05", categoryName:"Sports",          name:"Adidas Ultraboost 24",          shortDescription:"Energy-returning Boost midsole, Primeknit+ upper",        description:"The Adidas Ultraboost 24 features an updated design with exceptional energy return.",                        price:3499,  compareAtPrice:3999,  currency:"ZAR", images:["#FFFFFF","#EEEEEE"], emoji:"👟", status:"active", stock:95,  sku:"ADI-UB24",     brand:"Adidas",   tags:["running","shoes","performance"],attributes:{Drop:"10mm",Weight:"310g"},                         variants:[{id:uuid(),type:"size",value:"8",additionalPrice:0,stock:20,sku:"UB24-8"},{id:uuid(),type:"size",value:"9",additionalPrice:0,stock:30,sku:"UB24-9"},{id:uuid(),type:"size",value:"10",additionalPrice:0,stock:30,sku:"UB24-10"},{id:uuid(),type:"size",value:"11",additionalPrice:0,stock:15,sku:"UB24-11"}], avgRating:4.6, reviewCount:340, totalSold:245, isFeatured:false, isFlashDeal:false, flashDealEndsAt:null },
  // Books
  { sellerId:"sel-06", sellerName:"BookWorld",     categoryId:"cat-06", categoryName:"Books & Media",   name:"Atomic Habits by James Clear",  shortDescription:"Proven framework for building good habits — #1 bestseller", description:"No matter your goals, Atomic Habits offers a proven framework for improving every day.",                   price:349,   compareAtPrice:399,   currency:"ZAR", images:["#1A237E","#283593"], emoji:"📖", status:"active", stock:500, sku:"BOOK-AH-JC",   brand:"Random House",tags:["self-help","habits","bestseller"],attributes:{Format:"Paperback",Pages:"320"},              variants:[{id:uuid(),type:"style",value:"Paperback",additionalPrice:0,stock:400,sku:"AH-PB"},{id:uuid(),type:"style",value:"Hardcover",additionalPrice:150,stock:100,sku:"AH-HC"}],   avgRating:4.9, reviewCount:1204, totalSold:892, isFeatured:true,  isFlashDeal:false, flashDealEndsAt:null },
];

export const PRODUCTS: Product[] = PRODUCTS_SEED.map(p => ({
  ...p,
  id: uuid(),
  slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  createdAt: ago(rand(720, 43800)),
  updatedAt: ago(rand(0, 720)),
}));

// Update category product counts
CATEGORIES.forEach(c => { c.productCount = PRODUCTS.filter(p => p.categoryId === c.id).length; });

// ─── Coupons ──────────────────────────────────────────────────────────────────
export const COUPONS: Coupon[] = [
  { id:uuid(), code:"WELCOME10",  type:"percentage",    value:10, minOrderAmount:500,  maxDiscountAmount:500,  usageLimit:null,  usageCount:1204, validFrom:ago(43800), validTo:future(365), active:true,  sellerId:null },
  { id:uuid(), code:"SAVE200",    type:"fixed_amount",  value:200, minOrderAmount:1000, maxDiscountAmount:null, usageLimit:5000,  usageCount:892,  validFrom:ago(4380),  validTo:future(30),  active:true,  sellerId:null },
  { id:uuid(), code:"FREESHIP",   type:"free_shipping", value:0,  minOrderAmount:250,  maxDiscountAmount:null, usageLimit:null,  usageCount:2180, validFrom:ago(8760),  validTo:future(90),  active:true,  sellerId:null },
  { id:uuid(), code:"TECH15",     type:"percentage",    value:15, minOrderAmount:2000, maxDiscountAmount:2000, usageLimit:1000,  usageCount:342,  validFrom:ago(720),   validTo:future(14),  active:true,  sellerId:"sel-01" },
];

// ─── Sample Orders ─────────────────────────────────────────────────────────────
const STATUSES: Order["status"][] = ["delivered","delivered","delivered","shipped","processing","pending"];
export const ORDERS: Order[] = Array.from({ length: 12 }, (_, i) => {
  const p1 = PRODUCTS[i % PRODUCTS.length];
  const p2 = PRODUCTS[(i + 2) % PRODUCTS.length];
  const status = STATUSES[i % STATUSES.length];
  const sub = p1.price + (i % 3 === 0 ? p2.price : 0);
  return {
    id: uuid(),
    orderNumber: `VNK-ORD-${String(100000 + i).padStart(6,"0")}`,
    userId: "demo-customer-001",
    customerName: "Margaret Botha",
    customerEmail: "margaret@example.com",
    items: [
      { productId:p1.id, productName:p1.name, emoji:p1.emoji, variantId:null, variantLabel:null, quantity:1, unitPrice:p1.price, totalPrice:p1.price, sellerId:p1.sellerId, sellerName:p1.sellerName },
      ...(i % 3 === 0 ? [{ productId:p2.id, productName:p2.name, emoji:p2.emoji, variantId:null, variantLabel:null, quantity:1, unitPrice:p2.price, totalPrice:p2.price, sellerId:p2.sellerId, sellerName:p2.sellerName }] : []),
    ],
    subtotal: sub, shippingCost: sub > 500 ? 0 : 99, taxAmount: +(sub * 0.15).toFixed(2),
    discountAmount: i % 4 === 0 ? 200 : 0,
    totalAmount: +(sub + (sub > 500 ? 0 : 99) + sub * 0.15 - (i % 4 === 0 ? 200 : 0)).toFixed(2),
    currency: "ZAR",
    status, paymentStatus: status === "pending" ? "pending" : "paid",
    paymentMethod: (["card","paypal","card","google_pay","card","wallet"][i % 6]) as Order["paymentMethod"],
    shippingAddress: { label:"Home", firstName:"Margaret", lastName:"Botha", line1:`${rand(1,999)} Main Road`, line2:null, city:"Cape Town", state:"Western Cape", postalCode:"8001", country:"ZA", phone:"+27821000001" },
    shippingStatus: status === "delivered" ? "delivered" : status === "shipped" ? "in_transit" : "not_shipped",
    trackingNumber: (status === "shipped" || status === "delivered") ? `VNK${rand(10000000,99999999)}` : null,
    carrier: (status === "shipped" || status === "delivered") ? "DHL Express" : null,
    estimatedDelivery: status !== "cancelled" ? future(rand(1,7)) : null,
    couponCode: i % 4 === 0 ? "SAVE200" : null, notes: null,
    placedAt: ago(rand(i*60+10, i*60+4320)),
    confirmedAt: status !== "pending" ? ago(rand(i*50, i*50+30)) : null,
    shippedAt: (status === "shipped" || status === "delivered") ? ago(rand(i*40, i*40+60)) : null,
    deliveredAt: status === "delivered" ? ago(rand(i*30, i*30+60)) : null,
    cancelledAt: status === "cancelled" ? ago(rand(0,120)) : null,
  };
});

// ─── Sample Reviews ────────────────────────────────────────────────────────────
const REVIEW_TEXTS = [
  { title:"Absolutely love it!", body:"This product exceeded all my expectations. The quality is outstanding and delivery was fast." },
  { title:"Great value for money", body:"Very happy with this purchase. Works exactly as described and the build quality is excellent." },
  { title:"Highly recommend", body:"Perfect product! Already recommended it to friends and family. Will definitely buy again." },
  { title:"Good but could be better", body:"Overall decent product. A few minor issues but nothing that affects core functionality." },
  { title:"Excellent quality", body:"Premium quality product. Looks and feels exactly like the photos. Very satisfied customer!" },
];

export const REVIEWS: Review[] = PRODUCTS.slice(0, 6).map((p, i) => ({
  id: uuid(), productId: p.id, userId: "demo-customer-001",
  orderId: ORDERS[i % ORDERS.length].id,
  rating: rand(4, 5), ...REVIEW_TEXTS[i % REVIEW_TEXTS.length],
  verifiedPurchase: true, status: "approved" as const, helpful: rand(5, 80),
  images: [], createdAt: ago(rand(60, 4320)), reviewerName: "Margaret B.",
}));

// ─── Sample Carts ──────────────────────────────────────────────────────────────
export const CARTS: Cart[] = [];

// ─── Wishlist ─────────────────────────────────────────────────────────────────
export const WISHLISTS: WishlistItem[] = PRODUCTS.slice(0, 3).map(p => ({
  userId: "demo-customer-001", productId: p.id, addedAt: ago(rand(60, 1440)),
}));

// ─── Addresses ───────────────────────────────────────────────────────────────
export const ADDRESSES: Address[] = [
  { id:uuid(), userId:"demo-customer-001", label:"Home",   firstName:"Margaret", lastName:"Botha",   line1:"42 Kloof Street",   line2:"Apt 3B", city:"Cape Town",    state:"Western Cape", postalCode:"8001", country:"ZA", phone:"+27821000001", isDefault:true  },
  { id:uuid(), userId:"demo-customer-001", label:"Office", firstName:"Margaret", lastName:"Botha",   line1:"1 Discovery Place", line2:null,     city:"Johannesburg", state:"Gauteng",      postalCode:"2196", country:"ZA", phone:"+27821000001", isDefault:false },
];

// ─── Platform Stats ───────────────────────────────────────────────────────────
export function getMarketplaceStats() {
  return {
    totalProducts: PRODUCTS.length, totalSellers: SELLERS.length,
    totalOrders: ORDERS.length, totalRevenue: +ORDERS.reduce((s,o) => s + o.totalAmount, 0).toFixed(2),
    activeCustomers: 4820, pendingReviews: 14,
    pendingSellerApprovals: 3,
    topCategories: CATEGORIES.slice(0,5).map(c => ({ name: c.name, count: c.productCount })),
  };
}
