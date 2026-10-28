export interface CatalogueService {
  id: string;
  name: string;
  details: string;
}

/** Reusable CloudX services. Prices are entered per document. */
export const serviceCatalogue: CatalogueService[] = [
{
  id: 'web-design',
  name: 'Website Design',
  details: 'UI/UX design, responsive layouts and brand-aligned visual design.'
},
{
  id: 'web-development',
  name: 'Website Development',
  details: 'Front-end and back-end development, CMS setup and launch support.'
},
{
  id: 'hosting',
  name: 'Web Hosting',
  details: 'Managed hosting with SSL certificate, backups and uptime monitoring.'
},
{
  id: 'domain',
  name: 'Domain Registration',
  details: 'Domain registration and DNS configuration.'
},
{
  id: 'crm',
  name: 'CRM System',
  details: 'Customer relationship management system setup and configuration.'
},
{
  id: 'pos',
  name: 'POS System',
  details: 'Point-of-sale system setup, configuration and staff training.'
},
{
  id: 'custom-software',
  name: 'Custom Software Development',
  details: 'Bespoke software designed and built to your requirements.'
},
{
  id: 'maintenance',
  name: 'Website Maintenance',
  details: 'Updates, security patches, backups and minor content changes.'
}];