#!/usr/bin/env python3
"""Post-fix _buildMessageWithAttachments if polish-three left escaped newlines."""
from pathlib import Path

p = Path('js/app.js')
s = p.read_text()

bad = "return '📎 **' + f.name + '**\\n\\n```"
good_fn = '''  _buildMessageWithAttachments(userText) {
    if (!AppState.attachedFiles.length) return userText;
    const blocks = AppState.attachedFiles.map(f => {
      const ext = (f.name.split('.').pop() || 'text').toLowerCase();
      const fence = ext === 'md' ? 'markdown' : ext;
      return '📎 **' + f.name + '**\n\n```' + fence + '\n' + f.content + '\n```';
    });
    const body = userText ? userText + '\n\n' : '';
    return body + blocks.join('\n\n');
  },'''

import re
s2, n = re.subn(
    r"  _buildMessageWithAttachments\(userText\) \{[\s\S]*?^  \},\n",
    good_fn + '\n',
    s,
    count=1,
    flags=re.M,
)
if n:
    p.write_text(s2)
    print('fixed _buildMessageWithAttachments', n)
else:
    print('pattern not found or already correct')
