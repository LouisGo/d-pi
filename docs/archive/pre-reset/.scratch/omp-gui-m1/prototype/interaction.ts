export default function (pi: any) {
  pi.registerCommand('probe-confirm', {
    description: 'Deterministic RPC interaction probe; no model request',
    handler: async (_args: string, ctx: any) => {
      const answer = await ctx.ui.confirm('M1 probe', 'Confirm local test?');
      ctx.ui.notify(`probe-confirm-result:${answer}`, 'info');
    },
  });
}
