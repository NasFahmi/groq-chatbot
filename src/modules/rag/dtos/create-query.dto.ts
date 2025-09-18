import { IsNotEmpty, IsString } from 'class-validator';

export class CreateQueryDto {
  @IsString()
  @IsNotEmpty()
  question: string;
}
