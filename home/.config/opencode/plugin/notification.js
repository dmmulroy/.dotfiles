export const NotificationPlugin = async ({ $ }) => {
  const soundPath = "~/.config/opencode/sounds/gow_active_reload.mp3";

  return {
    event: async ({ event }) => {
      if (event.type === "session.idle" || event.type === "permission.updated") {
        await $`afplay ${soundPath}`;
      }
    },
  };
};
