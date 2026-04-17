import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { FakeUsersService } from './fake-users.service';
import {
  BulkImportDto,
  ListFakeUsersDto,
  CreateFakeUserDto,
  BulkCreateDto,
  UpdateFakeUserDto,
  BulkUpdateDto,
  BulkDeleteDto,
  SetCountryDto,
} from './dto';

@ApiTags('Admin / Fake Users')
@Controller('admin/fake-users')
@Public()
@UseGuards(AdminAuthGuard)
export class FakeUsersController {
  constructor(private readonly fakeUsersService: FakeUsersService) {}

  // --- Static routes FIRST (before :id param routes) ---

  @Post('bulk-import')
  @ApiOperation({ summary: 'Toplu fake user import et' })
  async bulkImport(@Body() dto: BulkImportDto) {
    return this.fakeUsersService.bulkImport(dto.users);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Toplu fake user oluştur' })
  async bulkCreate(@Body() dto: BulkCreateDto) {
    return this.fakeUsersService.bulkCreate(dto);
  }

  @Patch('bulk')
  @ApiOperation({ summary: 'Toplu fake user güncelle' })
  async bulkUpdate(@Body() dto: BulkUpdateDto) {
    const { ids, ...changes } = dto;
    return this.fakeUsersService.bulkUpdate(ids, changes);
  }

  @Delete('bulk')
  @ApiOperation({ summary: 'Toplu fake user sil' })
  async bulkDelete(@Body() dto: BulkDeleteDto) {
    return this.fakeUsersService.bulkDelete(dto.ids);
  }

  // --- Parameterized routes ---

  @Get()
  @ApiOperation({ summary: 'Fake user listele (sayfalı)' })
  async list(@Query() query: ListFakeUsersDto) {
    return this.fakeUsersService.listFakeUsers(query);
  }

  @Post()
  @ApiOperation({ summary: 'Tek fake user oluştur' })
  async create(@Body() dto: CreateFakeUserDto) {
    return this.fakeUsersService.createFakeUser(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Tek fake user detay' })
  async getOne(@Param('id') id: string) {
    return this.fakeUsersService.getFakeUser(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Tek fake user güncelle' })
  async update(@Param('id') id: string, @Body() dto: UpdateFakeUserDto) {
    return this.fakeUsersService.updateFakeUser(id, dto);
  }

  @Post(':id/country')
  @ApiOperation({ summary: 'Fake user ülke ata' })
  async setCountry(@Param('id') id: string, @Body() dto: SetCountryDto) {
    return this.fakeUsersService.setCountry(id, dto.countryCode);
  }
}
