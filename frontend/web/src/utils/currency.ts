/**
 * Currency formatting utilities
 * Handles conversion between dollars (UI) and cents (backend) with precision
 */

/**
 * Format cents to dollar string with proper formatting
 * @param cents - Amount in cents (integer)
 * @returns Formatted string like "$1,234.56"
 */
export function formatCentsToDollars(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/**
 * Parse dollar input string to cents
 * Handles various formats: "1234.56", "1,234.56", "$1,234.56", etc.
 * @param input - Dollar amount as string
 * @returns Amount in cents (integer)
 * @throws Error if input is invalid
 */
export function parseDollarsToCents(input: string): number {
  if (!input || typeof input !== 'string') {
    throw new Error('Invalid input: must be a non-empty string');
  }

  // Remove currency symbols, spaces, and commas
  const cleaned = input.trim().replace(/[$,\s]/g, '');

  if (!cleaned) {
    throw new Error('Invalid input: empty after cleaning');
  }

  // Validate format: optional digits, optional decimal point, optional digits
  if (!/^\d*\.?\d+$/.test(cleaned)) {
    throw new Error('Invalid input: must be a valid number');
  }

  // Split by decimal point
  const parts = cleaned.split('.');

  if (parts.length > 2) {
    throw new Error('Invalid input: multiple decimal points');
  }

  const dollars = parts[0] || '0';
  const centsStr = parts[1] || '00';

  // Ensure cents has at most 2 digits
  if (centsStr.length > 2) {
    throw new Error('Invalid input: cents must have at most 2 decimal places');
  }

  // Pad cents to 2 digits if needed
  const paddedCents = centsStr.padEnd(2, '0');

  // Convert to integer cents
  const totalCents = parseInt(dollars, 10) * 100 + parseInt(paddedCents, 10);

  if (isNaN(totalCents) || totalCents < 0) {
    throw new Error('Invalid input: must be a positive number');
  }

  return totalCents;
}

/**
 * Format a number as currency without the dollar sign (for inputs)
 * @param cents - Amount in cents
 * @returns String like "1,234.56"
 */
export function formatCentsForInput(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

