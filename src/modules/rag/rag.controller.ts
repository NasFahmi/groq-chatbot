import {
  Body,
  Controller,
  Post,
  HttpException,
  HttpStatus,
  Logger,
  HttpCode,
  Get,
} from '@nestjs/common';
import { RagService } from './rag.service';
import { CreateQueryDto } from './dtos/create-query.dto';

@Controller('rag')
export class RagController {
  private readonly logger = new Logger(RagController.name);

  constructor(private readonly ragService: RagService) {}

  @Post('query')
  @HttpCode(HttpStatus.OK)
  async queryUMKM(@Body() queryDto: CreateQueryDto) {
    try {
      this.logger.log(`Received query: ${queryDto.question}`);

      const answer = await this.ragService.queryRAG(queryDto.question);

      return {
        message: 'Berhasil mendapat jawaban',
        data: answer,
      };
    } catch (error) {
      this.logger.error('Error processing query:', error);
      throw new HttpException(
        {
          message: 'Failed to process your question',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('insights')
  @HttpCode(HttpStatus.OK)
  async insights(): Promise<any> {
    try {
      this.logger.log('Processing insights');

      const insights = await this.ragService.getInsights();

      return {
        message: 'Berhasil mendapat insights',
        data: insights,
      };
    } catch (error) {
      this.logger.error('Error processing query:', error);
      throw new HttpException(
        {
          message: 'Failed to process your question',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
