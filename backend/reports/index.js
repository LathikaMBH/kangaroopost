// Reports the admin can open on the Kangodrop website (Reports card). They are added here as the admin asks for
// them. Each report is one entry:
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
const { queries } = require('../database');

module.exports = [
  {
    id: 'route-owners',
    title: 'Route owners',
    description: 'Every route owner with their contact details and how many routes and riders they have.',
    run: async () => ({
      columns: [
        { key: 'name', label: 'Route owner' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'city', label: 'City' },
        { key: 'routes', label: 'Routes', type: 'number' },
        { key: 'riders', label: 'Riders', type: 'number' },
        { key: 'created', label: 'Created', type: 'date' },
      ],
      rows: (await queries.getAllOwners()).map(o => ({
        name: o.name, email: o.email, phone: o.phone, city: o.city,
        routes: o.route_count, riders: o.rider_count, created: o.created_at,
      })),
    }),
  },
];
