import fs from 'fs';

const categories = {
  't-shirts': {
    vendor: ['BasicWear Co.', 'TrendyThreads', 'PremiumFit', 'UrbanStyle', 'CoolThreads'],
    colors: ['White', 'Black', 'Navy', 'Gray', 'Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Purple', 'Orange', 'Burgundy', 'Charcoal', 'Olive', 'Beige'],
    styles: ['Classic Cotton', 'Graphic Print', 'V-Neck Premium', 'Crew Neck', 'Pocket', 'Striped', 'Vintage', 'Oversized', 'Slim Fit', 'Athletic Fit'],
    basePrice: 29.99,
    priceRange: 20
  },
  'pants': {
    vendor: ['DenimDreams', 'SmartCasual Co.', 'ActiveLife', 'OutdoorEdge', 'UrbanFit'],
    colors: ['Blue', 'Black', 'Khaki', 'Gray', 'Navy', 'Olive', 'Beige', 'Brown', 'Charcoal', 'Stone'],
    styles: ['Slim Fit Denim Jeans', 'Classic Chinos', 'Athletic Joggers', 'Cargo', 'Straight Leg', 'Bootcut', 'Tapered', 'Wide Leg', 'Relaxed Fit'],
    basePrice: 69.99,
    priceRange: 30
  },
  'dresses': {
    vendor: ['SummerBloom', 'LuxeEvening', 'CasualChic', 'BohoStyle', 'ElegantAffair'],
    colors: ['Coral', 'Black', 'Navy', 'Red', 'White', 'Pink', 'Blue', 'Green', 'Purple', 'Burgundy', 'Yellow', 'Emerald'],
    styles: ['Floral Summer', 'Elegant Evening', 'Casual Midi', 'Bohemian Maxi', 'A-Line', 'Wrap', 'Shift', 'Bodycon', 'Shirt Dress', 'Cocktail'],
    basePrice: 89.99,
    priceRange: 80
  },
  'hoodies': {
    vendor: ['CozyWear', 'StreetStyle', 'ComfortZone', 'UrbanThreads', 'ActiveLife'],
    colors: ['Charcoal', 'Navy', 'Black', 'Gray', 'Burgundy', 'Olive', 'White', 'Red', 'Blue', 'Green'],
    styles: ['Zip-Up', 'Pullover', 'Oversized', 'Cropped', 'Athletic', 'Fleece-Lined', 'Lightweight', 'Heavy Duty'],
    basePrice: 59.99,
    priceRange: 25
  },
  'jackets': {
    vendor: ['DenimDreams', 'LuxeLeather', 'ActiveLife', 'OutdoorEdge', 'UrbanStyle'],
    colors: ['Light Wash', 'Black', 'Navy', 'Brown', 'Olive', 'Tan', 'Gray', 'Burgundy'],
    styles: ['Denim', 'Leather Bomber', 'Windbreaker', 'Puffer', 'Varsity', 'Trucker', 'Moto', 'Field', 'Harrington'],
    basePrice: 119.99,
    priceRange: 150
  },
  'shorts': {
    vendor: ['ActiveLife', 'OutdoorEdge', 'BeachVibes', 'SportsPro', 'CasualFit'],
    colors: ['Black', 'Navy', 'Beige', 'Khaki', 'Gray', 'Olive', 'Blue', 'Red'],
    styles: ['Running', 'Cargo', 'Chino', 'Denim', 'Athletic', 'Board', 'Bermuda', 'Golf'],
    basePrice: 34.99,
    priceRange: 25
  },
  'sweaters': {
    vendor: ['WinterWarmth', 'CozyKnits', 'LuxeLayers', 'ClassicComfort', 'UrbanStyle'],
    colors: ['Burgundy', 'Cream', 'Navy', 'Gray', 'Black', 'Camel', 'Olive', 'Maroon', 'Forest Green'],
    styles: ['Crew Neck', 'Turtleneck', 'V-Neck', 'Cardigan', 'Cable Knit', 'Fair Isle', 'Cashmere Blend', 'Chunky Knit'],
    basePrice: 79.99,
    priceRange: 50
  },
  'shirts': {
    vendor: ['SmartCasual Co.', 'SummerBloom', 'BusinessClass', 'RelaxedFit', 'PremiumShirts'],
    colors: ['White', 'Blue', 'Pink', 'Black', 'Gray', 'Green', 'Purple', 'Striped', 'Checked'],
    styles: ['Oxford Dress', 'Linen', 'Flannel', 'Chambray', 'Denim', 'Hawaiian', 'Western', 'Camp Collar'],
    basePrice: 59.99,
    priceRange: 30
  },
  'activewear': {
    vendor: ['ActiveLife', 'FitnessPro', 'YogaZen', 'SportElite', 'FlexFit'],
    colors: ['Black', 'Gray', 'Navy', 'Purple', 'Pink', 'Blue', 'Red', 'Green', 'Teal'],
    styles: ['Yoga Leggings', 'Sports Bra', 'Tank Top', 'Running Tights', 'Compression', 'Track Pants', 'Gym Shorts', 'Muscle Tee'],
    basePrice: 44.99,
    priceRange: 35
  },
  'accessories': {
    vendor: ['LuxeLeather', 'TrendyThreads', 'WinterWarmth', 'StyleEssentials', 'UrbanAccents'],
    colors: ['Brown', 'Black', 'Navy', 'Gray', 'Tan', 'Red', 'Blue'],
    styles: ['Leather Belt', 'Baseball Cap', 'Wool Scarf', 'Beanie', 'Backpack', 'Wallet', 'Sunglasses', 'Watch'],
    basePrice: 29.99,
    priceRange: 100
  },
  'footwear': {
    vendor: ['StepStyle', 'LuxeLeather', 'ComfortWalk', 'SportStride', 'UrbanSteps'],
    colors: ['White', 'Black', 'Brown', 'Navy', 'Gray', 'Tan', 'Red', 'Blue'],
    styles: ['Canvas Sneakers', 'Leather Boots', 'Running Shoes', 'Loafers', 'Sandals', 'High-tops', 'Slip-ons', 'Dress Shoes'],
    basePrice: 79.99,
    priceRange: 120
  },
  'underwear': {
    vendor: ['BasicWear Co.', 'ComfortEssentials', 'PremiumBasics', 'EverydayFit'],
    colors: ['Black', 'Navy', 'Gray', 'White', 'Blue', 'Red'],
    styles: ['Cotton Socks 3-Pack', 'Boxer Briefs 3-Pack', 'Briefs 3-Pack', 'Ankle Socks 5-Pack', 'Athletic Socks', 'Crew Socks'],
    basePrice: 19.99,
    priceRange: 25
  },
  'skirts': {
    vendor: ['FeminineFlair', 'ChicStyle', 'ModernWoman', 'TrendyBottom', 'ElegantEdge'],
    colors: ['Black', 'Navy', 'Red', 'Plaid', 'Denim', 'White', 'Pink', 'Gray'],
    styles: ['Pencil', 'A-Line', 'Pleated', 'Mini', 'Midi', 'Maxi', 'Wrap', 'Denim'],
    basePrice: 49.99,
    priceRange: 40
  },
  'blazers': {
    vendor: ['BusinessClass', 'SharpStyle', 'ExecutiveFit', 'SmartCasual Co.', 'PowerSuit'],
    colors: ['Navy', 'Black', 'Gray', 'Charcoal', 'Tan', 'Brown', 'Pinstripe'],
    styles: ['Classic Single-Breasted', 'Double-Breasted', 'Unstructured', 'Slim Fit', 'Oversized', 'Cropped'],
    basePrice: 149.99,
    priceRange: 100
  },
  'coats': {
    vendor: ['WinterWarmth', 'LuxeOuterwear', 'ColdDefender', 'StyleShield', 'UrbanCoats'],
    colors: ['Black', 'Navy', 'Camel', 'Gray', 'Charcoal', 'Burgundy', 'Olive'],
    styles: ['Trench', 'Peacoat', 'Overcoat', 'Parka', 'Wool Blend', 'Down', 'Rain'],
    basePrice: 199.99,
    priceRange: 200
  }
};

const sizeVariants = {
  clothing: ['Small', 'Medium', 'Large', 'XL'],
  clothingXS: ['XS', 'Small', 'Medium', 'Large', 'XL'],
  pants: ['28', '30', '32', '34', '36', '38'],
  pantsInseam: ['28x30', '30x30', '32x32', '34x32', '36x34'],
  shoes: ['7', '8', '9', '10', '11', '12'],
  oneSize: ['One Size'],
  belts: ['32', '34', '36', '38', '40'],
  shirts: ['Small', 'Medium', 'Large', 'XL', 'XXL']
};

function generateProducts() {
  const products = [];
  let productId = 1000;
  let variantIdBase = 10000;

  Object.entries(categories).forEach(([category, config]) => {
    const itemsToGenerate = Math.ceil(750 / Object.keys(categories).length);
    
    for (let i = 0; i < itemsToGenerate; i++) {
      productId++;
      const style = config.styles[i % config.styles.length];
      const color = config.colors[Math.floor(i / config.styles.length) % config.colors.length];
      const vendor = config.vendor[i % config.vendor.length];
      const price = +(config.basePrice + (Math.random() * config.priceRange)).toFixed(2);
      
      // Determine size variants based on category
      let sizes;
      if (category === 'pants') {
        sizes = i % 2 === 0 ? sizeVariants.pants : sizeVariants.pantsInseam;
      } else if (category === 'footwear') {
        sizes = sizeVariants.shoes;
      } else if (category === 'accessories') {
        sizes = style.includes('Belt') ? sizeVariants.belts : sizeVariants.oneSize;
      } else if (category === 'dresses' || category === 'skirts' || category === 'activewear') {
        sizes = sizeVariants.clothingXS;
      } else if (category === 'underwear') {
        sizes = sizeVariants.clothing;
      } else {
        sizes = sizeVariants.clothing;
      }

      const variants = sizes.map((size, idx) => {
        variantIdBase++;
        return {
          id: variantIdBase,
          title: size,
          price: price,
          inventory_quantity: Math.floor(Math.random() * 80) + 20
        };
      });

      products.push({
        id: productId,
        title: `${style} - ${color}`,
        status: 'active',
        category: category,
        price: price,
        vendor: vendor,
        variants: variants
      });
    }
  });

  return products;
}

const products = generateProducts();
const output = {
  products: products
};

fs.writeFileSync('src/data/products.json', JSON.stringify(output, null, 2));
console.log(`Generated ${products.length} products with ${products.reduce((sum, p) => sum + p.variants.length, 0)} total variants`);
