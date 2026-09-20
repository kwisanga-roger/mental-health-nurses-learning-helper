// Minimal, zero-dependency PDF text extractor for text-based PDFs.
// Reads FlateDecode (zlib) content streams and pulls text from Tj / TJ operators.
// Scanned/image-only PDFs have no embedded text, so they return little/nothing.
import zlib from 'node:zlib';

function decodePdfString(s) {
  return s
    .split('\
').join('
')
    .split('\\r').join('\r')
    .split('\\t').join('\t')
    .split('\\(').join('(')
    .split('\\)').join(')')
    .split('\\\\').join('\\')
    .replace(/\\([0-7]{1,3})/g, function (m, o) { return String.fromCharCode(parseInt(o, 8)); });
}

function extractStrings(content) {
  var out = '';
  var reString = /\((?:\\.|[^\\()])*\)/g;
  var parts = content.split(/(Tj|TJ|Td|TD|T\*|Tm)/);
  for (var i = 0; i < parts.length; i++) {
    var tok = parts[i];
    var found = tok.match(reString);
    if (found) {
      for (var j = 0; j < found.length; j++) {
        out += decodePdfString(found[j].slice(1, -1));
      }
    }
    if (tok === 'Td' || tok === 'TD' || tok === 'T*') out += '
';
    if (tok === 'Tj' || tok === 'TJ') out += ' ';
  }
  return out;
}

export function extractPdfText(buffer) {
  var buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  var text = '';
  var idx = 0;
  while (true) {
    var sIdx = buf.indexOf('stream', idx);
    if (sIdx === -1) break;
    var dataStart = sIdx + 6; // length of 'stream'
    if (buf[dataStart] === 0x0d) dataStart++;
    if (buf[dataStart] === 0x0a) dataStart++;
    var eIdx = buf.indexOf('endstream', dataStart);
    if (eIdx === -1) break;
    var chunk = buf.slice(dataStart, eIdx);
    idx = eIdx + 9; // length of 'endstream'

    var content = null;
    try {
      content = zlib.inflateSync(chunk).toString('latin1');
    } catch (e1) {
      try {
        content = zlib.inflateRawSync(chunk).toString('latin1');
      } catch (e2) {
        content = chunk.toString('latin1');
      }
    }
    if (content && (content.indexOf('Tj') !== -1 || content.indexOf('TJ') !== -1)) {
      text += extractStrings(content) + '
';
    }
  }
  text = text.replace(/[ \t]+/g, ' ').replace(/
{3,}/g, '

').trim();
  return text;
}
