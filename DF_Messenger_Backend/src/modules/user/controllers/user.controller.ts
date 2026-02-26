import { Body, Controller, Get, Post, Put, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { JwtGuard } from '../../../guards/jwt.guard'
import { changeEmailDto, changePasswordDto, confirmChangeEmailDto, confirmChangePasswordDto, getRefreshDto, profileUpdateDto } from '../dto/common.dto'
import { UserService } from '../services/user.service'


@Controller('user')
export class UserController {
  constructor(
    private userService: UserService
  ) { }

  @Post('refresh')
  async getRefreshToken(@Body() dto: getRefreshDto) {
    const tokens = await this.userService.verifyAndGiveRefreshToken(dto)
    return tokens
  }

  @Post('logout')
  @UseGuards(JwtGuard)
  async logout(@Body() dto: getRefreshDto, @Req() req) {
    const result = await this.userService.logout(dto)
    return { success: result }
  }

  // Profile

  @Get('me')
  @UseGuards(JwtGuard)
  async getMe(@Req() req) {
    return this.userService.getMe(req.user.userId)
  }

  @Put('me/update')
  @UseGuards(JwtGuard)
  async profileUpdate(@Body() dto: profileUpdateDto, @Req() req) {
    return this.userService.profileUpdate(dto, req.user.userId)
  }

  // AVATAR

  @Post('me/avatarUpload')
  @UseGuards(JwtGuard)
  @UseInterceptors(FileInterceptor('file'))
  async changeAvatar(@UploadedFile() file: Express.Multer.File, @Req() req) {
    return this.userService.changeAvatar(req.user.userId, file)
  }

  //EMAIL

  @Put('me/email-change')
  @UseGuards(JwtGuard)
  async changeUserEmail(@Body() dto: changeEmailDto, @Req() req) {
    return await this.userService.changeEmail(dto, req.user.userId)
  }

  @Put('me/email-change/confirm')
  @UseGuards(JwtGuard)
  async confirmChangeUserEmail(@Body() dto: confirmChangeEmailDto, @Req() req) {
    return await this.userService.confirmChangeEmail(dto, req.user.userId)
  }

  // PASSWORD

  @Put('me/password-change')
  @UseGuards(JwtGuard)
  async changePassword(@Body() dto: changePasswordDto, @Req() req) {
    return await this.userService.changePassword(dto, req.user.userId)
  }

  @Put('me/password-change/confirm')
  @UseGuards(JwtGuard)
  async confirmChangePassword(@Body() dto: confirmChangePasswordDto, @Req() req) {
    return await this.userService.confirmChangePassword(dto, req.user.userId)
  }


}