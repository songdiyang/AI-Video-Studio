/**
 * 断路器模式实现（Circuit Breaker Pattern）
 * 
 * 理论基础：Release It! (Nygard, 2007)
 * 防止对故障服务的持续调用造成级联故障
 * 
 * 三状态：
 * - CLOSED（正常）：请求正常通过，失败计数
 * - OPEN（断路）：请求直接拒绝，定时尝试恢复
 * - HALF_OPEN（半开）：允许少量请求探测，成功则关闭，失败则重开
 */

class CircuitBreaker {
  constructor(fn, options = {}) {
    this.fn = fn;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.halfOpenMaxAttempts = options.halfOpenMaxAttempts || 3;
    this.onStateChange = options.onStateChange || null;
    
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = 0;
    this.openedAt = 0;
    
    // 统计
    this.stats = {
      totalCalls: 0,
      totalSuccess: 0,
      totalFailure: 0,
      totalRejected: 0,
      lastError: null,
      stateChanges: []
    };
  }

  async call(...args) {
    this.stats.totalCalls++;

    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt >= this.resetTimeout) {
        this._changeState('HALF_OPEN');
      } else {
        this.stats.totalRejected++;
        throw new CircuitBreakerOpenError(
          `断路器已打开，拒绝请求 (将在 ${Math.ceil((this.resetTimeout - (Date.now() - this.openedAt)) / 1000)}s 后尝试恢复)`
        );
      }
    }

    if (this.state === 'HALF_OPEN' && this.halfOpenAttempts >= this.halfOpenMaxAttempts) {
      this.stats.totalRejected++;
      throw new CircuitBreakerOpenError('断路器半开状态，探测次数已用完');
    }

    if (this.state === 'HALF_OPEN') {
      this.halfOpenAttempts++;
    }

    try {
      const result = await this.fn(...args);
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure(error);
      throw error;
    }
  }

  _onSuccess() {
    this.stats.totalSuccess++;
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 1) {
        this._changeState('CLOSED');
      }
    }
  }

  _onFailure(error) {
    this.stats.totalFailure++;
    this.stats.lastError = error.message;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this._changeState('OPEN');
    } else if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      this._changeState('OPEN');
    }
  }

  _changeState(newState) {
    const oldState = this.state;
    this.state = newState;

    if (newState === 'OPEN') {
      this.openedAt = Date.now();
      this.halfOpenAttempts = 0;
      this.successCount = 0;
    } else if (newState === 'HALF_OPEN') {
      this.halfOpenAttempts = 0;
      this.successCount = 0;
    } else if (newState === 'CLOSED') {
      this.failureCount = 0;
      this.successCount = 0;
    }

    this.stats.stateChanges.push({
      from: oldState,
      to: newState,
      at: new Date().toISOString()
    });

    if (this.onStateChange) {
      try { this.onStateChange(oldState, newState); } catch (e) {}
    }
  }

  getState() { return this.state; }
  getStats() { return { ...this.stats, state: this.state, failureCount: this.failureCount }; }
  reset() { this._changeState('CLOSED'); this.failureCount = 0; }
}

class CircuitBreakerOpenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.isCircuitBreakerOpen = true;
  }
}

module.exports = { CircuitBreaker, CircuitBreakerOpenError };
