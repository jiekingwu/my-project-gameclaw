// components/chat-bubble/chat-bubble.js — Phase 2 升级
const { parseMarkdown } = require('../../utils/md-parser');

Component({
  properties: {
    role: {
      type: String,
      value: 'ai', // 'ai' | 'user'
    },
    content: {
      type: String,
      value: '',
    },
  },

  observers: {
    content(val) {
      if (this.data.role === 'ai' && val) {
        this.setData({ richContent: parseMarkdown(val) });
      }
    },
  },

  data: {
    richContent: '',
  },
});
