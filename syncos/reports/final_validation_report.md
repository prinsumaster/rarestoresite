# Final Validation Report

## 1. Validation Status
- **Status:** PASS
- **Process Exit Code:** 0
- **Run ID:** `d9e18b20-c011-467e-b1e4-072b6f925282`
- **Validation Timestamp:** 2026-07-17T05:01:48.747Z

## 2. Rule Results
- **Product Count Match**
  - Status: PASS
  - Execution Time: 1ms
- **Catalog Hash Match**
  - Status: PASS
  - Execution Time: 3ms
- **Price Match**
  - Status: PASS
  - Execution Time: 1ms
- **Stock Match**
  - Status: PASS
  - Execution Time: 1ms
- **Images Match**
  - Status: PASS
  - Execution Time: 1ms
- **Videos Match**
  - Status: PASS
  - Execution Time: 1ms
- **Sizes Match**
  - Status: PASS
  - Execution Time: 1ms
- **Categories Match**
  - Status: PASS
  - Execution Time: 1ms
- **Frontend Compatibility**
  - Status: PASS
  - Execution Time: 2586ms
- **Queue Recovery**
  - Status: PASS
  - Execution Time: 1ms
- **Transaction Safety**
  - Status: PASS
  - Execution Time: 1ms

## 3. Catalog Comparison
- **Legacy Raw Hash:** `1165582829f268a2e5d2cd5066c13b1e83fd52cb7484c46c80315b25003ad6a6`
- **SyncOS Raw Hash:** `b4e31a7b0b38f5fcec199e1b627222c001e459dcd5a7692e309753b1059ec4ab`
- **Legacy Canonical Hash:** `d4a8ff0412607c75b6ccd02e7d394162fe086149178cb4c0cc9b62124d04926e`
- **SyncOS Canonical Hash:** `d4a8ff0412607c75b6ccd02e7d394162fe086149178cb4c0cc9b62124d04926e`
- **Products Compared:** 64
- **Total Differences:** 0


## 4. Reliability Metrics
- Products Scanned: 0
- Products Updated: 0
- Products Skipped: 0
- Retry Count: 0
- Failed Jobs: 0
- Queue Recoveries: 0
- Rollbacks: 0

## 5. Performance Metrics
- Runtime: 0s
- CPU Usage: 3.95 (1m avg)
- Peak Memory: 107.45 MB
- HTTP Requests: ~73
- Average Extraction Time: 0ms
- Average Validation Time: 0ms
- Average Merge Time: 0.1875ms

## 6. Data Quality
- **Products Missing Prices:**
  - Expected/Supplier: 73
  - Extraction Failure: 0
  - Validation Failure: 0
- **Products Missing Images:**
  - Expected/Supplier: 4
  - Extraction Failure: 0
  - Validation Failure: 0
- **Products Missing Sizes:**
  - Expected/Supplier: 6
  - Extraction Failure: 0
  - Validation Failure: 0
- **Products Missing Videos:**
  - Expected/Supplier: 73
  - Extraction Failure: 0
  - Validation Failure: 0
- Products with Multiple Suppliers: 9
- Products Marked Unhealthy: 0

## 7. Validation Trend (Rolling)
- Consecutive PASS: 10
- Consecutive PASS WITH DIFFERENCES: 0
- Consecutive FAIL: 0
- Average Validation Runtime: 3528ms
- Average Retries: 1.0

## 8. Production Gate
- **Decision:** READY FOR PRODUCTION
- **Reason:** 5 consecutive PASS achieved (10 total). All validation criteria met.
