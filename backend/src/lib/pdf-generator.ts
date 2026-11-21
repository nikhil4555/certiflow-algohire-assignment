import PDFDocument from 'pdfkit'
import { env } from '../config/env'

export interface CertificateData {
  certNumber: string
  candidateName: string
  courseName: string
  score: string
  trainingCentre: string
  district: string
  issuedAt: Date
}

/**
 * Generate a certificate PDF as a Buffer.
 * Uses PDFKit — pure JS, no headless browser needed, fast.
 *
 * The PDF contains the certificate number as plain text AND as a URL that an
 * employer can visit to verify authenticity. Even if someone edits the PDF
 * and changes the name, the certificate number links back to the real record.
 */
export function generateCertificatePdf(data: CertificateData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
    })

    const buffers: Buffer[] = []
    doc.on('data', (chunk) => buffers.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    const pageWidth = doc.page.width
    const center = { align: 'center' as const }

    // ─── Header ─────────────────────────────────────────────────────────
    doc
      .fillColor('#1a365d')
      .fontSize(26)
      .font('Helvetica-Bold')
      .text('PRAGATI SKILLS MISSION', 60, 60, center)

    doc
      .fillColor('#2d6a4f')
      .fontSize(16)
      .font('Helvetica')
      .text('Government of Maharashtra', center)

    // Divider
    doc.moveDown(0.5)
    doc.moveTo(60, doc.y).lineTo(pageWidth - 60, doc.y).stroke('#1a365d')
    doc.moveDown(0.8)

    // ─── Title ───────────────────────────────────────────────────────────
    doc
      .fillColor('#333333')
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('CERTIFICATE OF COMPLETION', center)
      .moveDown(0.6)

    doc
      .fontSize(13)
      .font('Helvetica')
      .fillColor('#555555')
      .text('This is to certify that', center)
      .moveDown(0.4)

    // ─── Candidate Name ───────────────────────────────────────────────────
    doc
      .fillColor('#1a365d')
      .fontSize(24)
      .font('Helvetica-Bold')
      .text(data.candidateName, center)
      .moveDown(0.4)

    doc
      .fillColor('#555555')
      .fontSize(13)
      .font('Helvetica')
      .text('has successfully completed the vocational training programme in', center)
      .moveDown(0.3)

    // ─── Course ───────────────────────────────────────────────────────────
    doc
      .fillColor('#2d6a4f')
      .fontSize(18)
      .font('Helvetica-Bold')
      .text(data.courseName, center)
      .moveDown(0.3)

    doc
      .fillColor('#555555')
      .fontSize(12)
      .font('Helvetica')
      .text(`Score: ${data.score}%  |  Training Centre: ${data.trainingCentre}  |  District: ${data.district}`, center)
      .moveDown(0.4)

    doc
      .text(`Date of Issue: ${data.issuedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, center)

    // ─── Footer / Verification ────────────────────────────────────────────
    doc.moveDown(1)
    doc.moveTo(60, doc.y).lineTo(pageWidth - 60, doc.y).stroke('#cccccc')
    doc.moveDown(0.5)

    doc
      .fillColor('#888888')
      .fontSize(9)
      .text(`Certificate No: ${data.certNumber}`, center)
      .text(
        `Verify this certificate at: ${env.FRONTEND_URL}/verify/${data.certNumber}`,
        center
      )
      .text(
        'This certificate is digitally issued by the Pragati Skills Mission. Any alteration is a criminal offence.',
        center
      )

    doc.end()
  })
}
