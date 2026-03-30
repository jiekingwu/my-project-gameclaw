// components/reminder-confirm/reminder-confirm.js
Component({
  properties: {
    show: { type: Boolean, value: false },
    content: { type: String, value: '' },
    time: { type: String, value: '' },
  },
  methods: {
    onConfirm() {
      this.triggerEvent('confirm');
    },
    onCancel() {
      this.triggerEvent('cancel');
    },
  },
});
