import { ResponseModel } from './responseModel';

/**
 * Counterpart of the backend IDataResult<T> — for endpoints that return a single object.
 * For endpoints that return an array, ListResponseModel<T> is used.
 */
export interface DataResponseModel<T> extends ResponseModel {
  data: T;
}
