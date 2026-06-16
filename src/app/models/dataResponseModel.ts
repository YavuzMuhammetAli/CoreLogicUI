import { ResponseModel } from './responseModel';

/**
 * Backend IDataResult<T> karşılığı — tekil nesne döndüren endpoint'ler için.
 * Dizi döndüren endpoint'ler için ListResponseModel<T> kullanılır.
 */
export interface DataResponseModel<T> extends ResponseModel {
  data: T;
}
