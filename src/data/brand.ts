export const brandAssets = {
  /** Official CloudX Global logo (on black) — used on dark surfaces in the app */
  logoOnDark: "/Logo.png",
  /** The logo on a transparent background (dark lettering) — printed on the white page of invoices and quotations */
  logoDocument: "/Logo-document-light.png"
};

/** Company contact details printed in the footer of every invoice and quotation. */
export const companyContact = {
  email: "contact.cloudxglobal@gmail.com"
};

/** Colours used inside generated PDFs (kept in sync with --brand in index.css) */
export const documentColors = {
  brand: '#941CB8',
  brandDeep: '#6F1488',
  black: '#000000',
  ink: '#1F2321',
  navy: '#2B2D4E',
  body: '#4A4A4A',
  muted: '#7A7A7A',
  white: '#FFFFFF',
  /** very light lilac used for zebra rows and soft panels */
  tint: '#F7F0FA',
  /** hairlines on white paper */
  rule: '#E4DAEA',
  /** light purple text used on the black header band */
  onBlackSoft: '#D9B8E8'
};
