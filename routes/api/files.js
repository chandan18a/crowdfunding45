const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const mammoth = (() => { try { return require('mammoth'); } catch (e) { return null; } })();

// Helper: resolve a user-provided path safely within the uploads directory
function resolveUploadsPath(userPath) {
  // Normalize backslashes to forward slashes for Windows-origin paths
  userPath = (userPath || '').toString().replace(/\\/g, '/');
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  // Accept paths like "/uploads/filename" or "filename"
  const relative = userPath.startsWith('/uploads/') ? userPath.replace('/uploads/', '') : userPath.replace(/^\/*/, '');
  const safeFullPath = path.resolve(uploadsRoot, relative);
  // Prevent path traversal
  if (!safeFullPath.startsWith(uploadsRoot)) {
    return null;
  }
  return safeFullPath;
}

// Preview (inline) - streams the file with correct content-type
router.get('/preview', (req, res) => {
  try {
    const { file } = req.query;
    console.log('🔍 Files preview request:', { file, query: req.query });
    if (!file) return res.status(400).json({ message: 'Missing file parameter' });
    const fullPath = resolveUploadsPath(file);
    console.log('🔍 Resolved path:', fullPath);
    if (!fullPath) return res.status(400).json({ message: 'Invalid file path' });
    if (!fs.existsSync(fullPath)) {
      console.log('❌ File not found:', fullPath);
      return res.status(404).json({ message: 'File not found' });
    }

    console.log('✅ Serving file:', fullPath);
    
    // Get file extension and set proper MIME type
    const ext = path.extname(fullPath).toLowerCase();
    const fileName = path.basename(fullPath);
    
    let mimeType = 'application/octet-stream';
    let contentDisposition = 'inline';
    
    // Set proper MIME types for different file types
    if (ext === '.pdf') {
      mimeType = 'application/pdf';
    } else if (ext === '.docx') {
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (ext === '.doc') {
      mimeType = 'application/msword';
    } else if (ext === '.xlsx') {
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (ext === '.xls') {
      mimeType = 'application/vnd.ms-excel';
    } else if (ext === '.pptx') {
      mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    } else if (ext === '.ppt') {
      mimeType = 'application/vnd.ms-powerpoint';
    } else if (['.jpg', '.jpeg'].includes(ext)) {
      mimeType = 'image/jpeg';
    } else if (ext === '.png') {
      mimeType = 'image/png';
    } else if (ext === '.gif') {
      mimeType = 'image/gif';
    } else if (ext === '.webp') {
      mimeType = 'image/webp';
    } else if (ext === '.svg') {
      mimeType = 'image/svg+xml';
    } else if (ext === '.txt') {
      mimeType = 'text/plain';
    } else if (ext === '.html') {
      mimeType = 'text/html';
    } else if (ext === '.css') {
      mimeType = 'text/css';
    } else if (ext === '.js') {
      mimeType = 'application/javascript';
    } else if (ext === '.json') {
      mimeType = 'application/json';
    }
    
    // Set proper headers for inline viewing
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `${contentDisposition}; filename="${fileName}"`);
    
    // Set aggressive no-cache headers to avoid flicker on re-toggles
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Add CORS headers for cross-origin requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    console.log(`📄 Serving ${mimeType} file: ${fileName}`);
    return res.sendFile(fullPath);
  } catch (e) {
    console.error('❌ Files preview error:', e);
    return res.status(500).json({ message: 'Error serving file', error: e.message });
  }
});

// Download - sets content-disposition attachment
router.get('/download', (req, res) => {
  try {
    const { file, filename } = req.query;
    if (!file) return res.status(400).json({ message: 'Missing file parameter' });
    const fullPath = resolveUploadsPath(file);
    if (!fullPath) return res.status(400).json({ message: 'Invalid file path' });
    if (!fs.existsSync(fullPath)) return res.status(404).json({ message: 'File not found' });

    const downloadName = filename || path.basename(fullPath);
    
    // Set proper headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Add CORS headers for cross-origin requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    console.log(`📥 Downloading file: ${downloadName}`);
    return res.download(fullPath, downloadName);
  } catch (e) {
    console.error('❌ Files download error:', e);
    return res.status(500).json({ message: 'Error downloading file', error: e.message });
  }
});

// DOCX to HTML inline preview (no download)
router.get('/preview-docx', async (req, res) => {
  try {
    if (!mammoth) {
      return res.status(501).json({ message: 'DOCX preview not available (mammoth not installed)' });
    }
    const { file } = req.query;
    if (!file) return res.status(400).json({ message: 'Missing file parameter' });
    const fullPath = resolveUploadsPath(file);
    if (!fullPath) return res.status(400).json({ message: 'Invalid file path' });
    if (!fs.existsSync(fullPath)) return res.status(404).json({ message: 'File not found' });

    // Check if file is a supported Office document
    const fileExtension = path.extname(fullPath).toLowerCase();
    if (fileExtension !== '.docx' && fileExtension !== '.doc') {
      console.log(`⚠️ File ${file} is not a supported Office document (extension: ${fileExtension})`);
      const fallbackHtml = `<!doctype html><html><head><meta charset="utf-8"/><style>
        body{font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'; padding:16px; color:#6b7280;}
        .error-box{background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:16px; margin:16px 0;}
        .error-title{color:#dc2626; font-weight:600; margin-bottom:8px;}
        .error-message{color:#7f1d1d;}
      </style></head><body>
        <div class="error-box">
          <div class="error-title">⚠️ Document Preview Not Available</div>
          <div class="error-message">This file (${path.basename(fullPath)}) is not a supported Office document (.doc or .docx). Please download the file to view its contents.</div>
        </div>
      </body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res.send(fallbackHtml);
    }

    let htmlContent;
    
    if (fileExtension === '.docx') {
      // Handle DOCX files with mammoth
      const result = await mammoth.convertToHtml({ path: fullPath }, {
        styleMap: [
          'p[style-name="Title"] => h1:fresh',
          'p[style-name="Heading 1"] => h2:fresh',
          'p[style-name="Heading 2"] => h3:fresh'
        ]
      });
      htmlContent = result.value;
    } else if (fileExtension === '.doc') {
      // Handle DOC files - convert to PDF for inline viewing
      console.log(`📄 Converting .doc file to PDF: ${file}`);
      try {
        // For .doc files, we'll serve them directly as PDFs for inline viewing
        // This works because modern browsers can handle .doc files in iframes
        const mimeType = 'application/pdf';
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.sendFile(fullPath);
      } catch (error) {
        console.error('Error processing .doc file:', error);
        htmlContent = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; padding: 20px;">
            <h2>Document Preview Error</h2>
            <p><strong>File:</strong> ${path.basename(fullPath)}</p>
            <div style="background: #f8d7da; color: #721c24; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <p><strong>Error:</strong> Unable to process this .doc file. The file may be corrupted or in an unsupported format.</p>
            </div>
            <div style="text-align: center; margin: 20px 0;">
              <a href="/files/download?file=${encodeURIComponent(file)}" 
                 style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                📥 Download Document
              </a>
            </div>
          </div>
        `;
      }
    }
    
    const html = `<!doctype html><html><head><meta charset="utf-8"/><meta http-equiv="Cache-Control" content="no-store"/><style>
      body{font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'; padding:16px;}
      img{max-width:100%; height:auto}
      table{border-collapse: collapse}
      td, th{border:1px solid #e5e7eb; padding:4px 6px}
    </style></head><body>${htmlContent}</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.send(html);
  } catch (e) {
    console.error('❌ DOCX preview error:', e);
    
    // Provide a user-friendly error page instead of JSON
    const errorHtml = `<!doctype html><html><head><meta charset="utf-8"/><style>
      body{font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'; padding:16px; color:#6b7280;}
      .error-box{background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:16px; margin:16px 0;}
      .error-title{color:#dc2626; font-weight:600; margin-bottom:8px;}
      .error-message{color:#7f1d1d; margin-bottom:12px;}
      .error-details{color:#9ca3af; font-size:0.875rem; background:#f9fafb; padding:8px; border-radius:4px; font-family:monospace;}
    </style></head><body>
      <div class="error-box">
        <div class="error-title">❌ Document Preview Error</div>
        <div class="error-message">Unable to preview this document. The file may be corrupted or in an unsupported format.</div>
        <div class="error-details">Error: ${e.message}</div>
      </div>
    </body></html>`;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(500).send(errorHtml);
  }
});

module.exports = router;


