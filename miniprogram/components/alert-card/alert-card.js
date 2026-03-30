// components/alert-card/alert-card.js
Component({
  methods: {
    onTap(e) {
      const type = e.currentTarget.dataset.type;
      this.triggerEvent('alertTap', { type });
    },
  },
});
