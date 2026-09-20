// Minimal, zero-dependency PDF text extractor for text-based PDFs.
import zlib from 'node:zlib';

function decodePdfString(s) {
  var out = '';
  for (var i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      var nx = s[i + 1];
      if (nx === 'n') { out += ' '; i++; }
      else if (nx === 'r') { out += ' '; i++; }
      else if (nx === 't') { out += ' '; i++; }
      else if (nx === '(') { out += '('; i++; }
      else if (nx === ')') { out += ')'; i++; }
      else if (nx === '\\') { out += '\\'; i++; }
      else { out += nx; i++; }
    } else {
      out += s[i];
    }
  }
  return out;
}

function extractStrings(content) {
  var out = '';
  var reString = /\((?:\\.|[^\\()])*\)/g;
  var parts = content.split(/(Tj|TJ|Td|TD|Tm)/);
  for (var i = 0; i < parts.length; i++) {
    var tok = parts[i];
    var found = tok.match(reString);
    if (found) {
      for (var j = 0; j < found.length; j++) {
        out += decodePdfString(found[j].slice(1, -1));
      }
    }
    if (tok === 'Td' || tok === 'TD') { out += ' '; }
    if (tok === 'Tj' || tok === 'TJ') { out += ' '; }
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
    var dataStart = sIdx + 6;
    if (buf[dataStart] === 13) dataStart++;
    if (buf[dataStart] === 10) dataStart++;
    var eIdx = buf.indexOf('endstream', dataStart);
    if (eIdx === -1) break;
    var chunk = buf.slice(dataStart, eIdx);
    idx = eIdx + 9;
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
      text += extractStrings(content) + ' ';
    }
  }
  text = text.replace(/[ \t]+/g, ' ');
  return text.trim();
}
