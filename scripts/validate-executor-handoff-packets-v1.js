const validateexecutorHandoffPackets = (packets) => {
  packets.forEach(packet => {
    if (!packet.executor_target || !packet.payload_id || !packet.execution_id) {
      throw new Error('Each handoff packet must include executor_target, payload_id, and execution_id.');
    }
  });
};

module.exports = validateexecutorHandoffPackets;
