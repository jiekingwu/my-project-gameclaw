// components/welcome-card/welcome-card.js
Component({
  properties: {
    daysPlayed: {
      type: Number,
      value: 0,
    },
  },

  methods: {
    onSkillTap(e) {
      const skill = e.currentTarget.dataset.skill;
      this.triggerEvent('skillTap', { skill });
    },

    onMoreTap() {
      wx.navigateTo({ url: '/pages/skills/skills' });
    },
  },
});
