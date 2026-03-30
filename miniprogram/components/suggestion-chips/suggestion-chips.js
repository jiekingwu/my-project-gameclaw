// components/suggestion-chips/suggestion-chips.js
Component({
  properties: {
    chips: {
      type: Array,
      value: [],
    },
  },

  methods: {
    onTap(e) {
      const text = e.currentTarget.dataset.text;
      this.triggerEvent('chipTap', { text });
    },
  },
});
