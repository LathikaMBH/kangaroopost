// Reports the admin can open on the Kangarooposti website (Reports card). None yet: they are added here as the
// admin asks for them. Each report is one entry:
//
//   {
//     id: 'deliveries-by-route',                 // used in the URL: /api/reports/deliveries-by-route
//     title: 'Deliveries by route',
//     description: 'Stops delivered per route in the chosen period.',
//     run: async (params) => ({                    // params: the query string (validate it here)
//       columns: [{ key: 'route', label: 'Route' }, { key: 'delivered', label: 'Delivered', type: 'number' }],
//       rows: [{ route: 'Kortela 001', delivered: 120 }],
//     }),
//   }
//
// Column types: 'text' (default), 'number', 'date'. The website shows the rows as a table and offers a CSV download.
module.exports = [];
