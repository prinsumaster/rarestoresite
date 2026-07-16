# Final Validation Report

## 1. Validation Status
- **Status:** PASS
- **Process Exit Code:** 0
- **Run ID:** `90f114ae-6e83-484f-9767-cfd8689c3449`
- **Validation Timestamp:** 2026-07-16T15:30:35.103Z

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
  - Execution Time: 3390ms
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
- Products Scanned: 24
- Products Updated: 23
- Products Skipped: 1
- Retry Count: 0
- Failed Jobs: 0
- Queue Recoveries: 24
- Rollbacks: 0

## 5. Performance Metrics
- Runtime: 22s
- CPU Usage: 2.48 (1m avg)
- Peak Memory: 107.23 MB
- HTTP Requests: ~73
- Average Extraction Time: 0ms
- Average Validation Time: 0ms
- Average Merge Time: 0.125ms

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
- Consecutive PASS: 9
- Consecutive PASS WITH DIFFERENCES: 0
- Consecutive FAIL: 0
- Average Validation Runtime: 3595ms
- Average Retries: 1.0

## 8. Production Gate
- **Decision:** READY FOR PRODUCTION
- **Reason:** 5 consecutive PASS achieved (9 total). All validation criteria met.
