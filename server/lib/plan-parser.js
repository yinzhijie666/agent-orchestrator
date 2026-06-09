// Plan Document parser and validator
class PlanParser {
  static parse(rawPlan) {
    if (typeof rawPlan === 'string') {
      try {
        return JSON.parse(rawPlan);
      } catch {
        throw new Error('Plan document must be valid JSON or object');
      }
    }
    return rawPlan;
  }

  static validate(plan) {
    const errors = [];

    if (!plan.title) errors.push('Plan must have a title');
    if (!Array.isArray(plan.items)) {
      errors.push('Plan must have items array');
      return { valid: false, errors };
    }
    if (plan.items.length === 0) errors.push('Plan must have at least one item');

    plan.items.forEach((item, idx) => {
      if (!item.title) errors.push(`Item ${idx}: missing title`);
      if (!['kimi', 'deepseek', 'zen'].includes(item.executor)) {
        errors.push(`Item ${idx}: invalid executor "${item.executor}"`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static serialize(plan) {
    return JSON.stringify(plan, null, 2);
  }

  static estimateComplexity(plan) {
    const executorWeights = { kimi: 3, deepseek: 2, zen: 1 };
    return plan.items.reduce((sum, item) => sum + (executorWeights[item.executor] || 2), 0);
  }
}

export default PlanParser;