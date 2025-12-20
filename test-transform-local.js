import { executeTransformTool } from './lib/tools.js';

async function testTransformLocal() {
  console.log('Testing transform tool locally...\n');
  
  // Mock context with sample data
  const context = {
    node_0: { data: { data: { amount: "88000.50" } } },
    node_1: { data: { data: { amount: "3000.25" } } },
    node_2: { data: { chart: { result: [{ meta: { regularMarketPrice: "275.00" } }] } } }
  };
  
  const config = {
    operations: [
      {
        type: "extract",
        key: "btc_price",
        path: "{{node_0.data.data.amount}}"
      },
      {
        type: "extract",
        key: "eth_price",
        path: "{{node_1.data.data.amount}}"
      },
      {
        type: "extract",
        key: "stock_price",
        path: "{{node_2.data.chart.result.0.meta.regularMarketPrice}}"
      },
      {
        type: "template",
        key: "report",
        template: "Daily Market Report\\n\\nBitcoin: ${{btc_price}}\\nEthereum: ${{eth_price}}\\nAAPL: ${{stock_price}}\\n\\nGenerated at: {{timestamp}}"
      }
    ]
  };
  
  try {
    const result = await executeTransformTool(config, { ...context, timestamp: new Date().toISOString() });
    
    console.log('Transform result:');
    console.log(JSON.stringify(result, null, 2));
    
    console.log('\nFormatted report:');
    console.log(result.report);
    
  } catch (error) {
    console.error('Transform failed:', error);
  }
}

testTransformLocal();
